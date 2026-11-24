-- Phase 7: Admin → Customers, owner-assisted password reset, earnings chart.
--
--   admin_customers(search, sort, limit, offset)  customers grouped by phone number
--   admin_password_reset_target(user, phone)      checks an account may get a new password
--   admin_daily_earnings(from, to)                earnings per play date for the chart
--
-- All three are owner-only (private.require_owner) and read-only. The password
-- itself is changed by a server action with the secret key, after
-- admin_password_reset_target says yes: Postgres never sees the password.
--
-- Money follows the earnings rule (SPEC §9), the same one admin_summary uses:
--   counted bookings = confirmed customer bookings, plus cancel_requested ones
--   that were confirmed before the request; plus the fee kept from customer
--   cancellations whose refund is marked completed.

-- ---------------------------------------------------------------------------
-- admin_customers: one row per phone number (SPEC §4 Customers).
--
-- A group holds every customer booking made with that phone (guest or signed
-- in) except expired holds, and every customer account whose profile has that
-- phone or that booked with it. Accounts without a phone and without bookings
-- get a group of their own, so the owner can still find them for a reset.
-- Owner accounts are never listed as accounts.
--
--   accounts        [{id, name, email, can_reset}] — can_reset = has an
--                   email/password login (the only kind in v1)
--   bookings/hours/total_spent = counted bookings (+ kept cancellation fees)
--   guest_bookings  counted bookings made without an account
--   last_visit      start of the latest counted booking that has started
--   next_visit      start of the earliest counted booking still to come
--   total_count     rows matching the search, for paging
--
-- p_search matches names, emails and phone numbers ("0917 123", "+63917…",
-- "maria"). p_sort: recent (default) · spent · bookings · name.
-- ---------------------------------------------------------------------------
create or replace function public.admin_customers(
  p_search text default null,
  p_sort   text default 'recent',
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  phone          text,
  name           text,
  email          text,
  accounts       jsonb,
  bookings       integer,
  guest_bookings integer,
  hours          integer,
  total_spent    integer,
  last_visit     timestamptz,
  next_visit     timestamptz,
  first_seen     timestamptz,
  total_count    integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner  uuid := private.require_owner();
  v_search text := lower(nullif(btrim(p_search), ''));
  v_digits text;
  v_sort   text := coalesce(nullif(btrim(p_sort), ''), 'recent');
begin
  if v_search is not null and char_length(v_search) > 100 then
    raise exception 'invalid_search' using errcode = 'P0001';
  end if;
  if v_sort not in ('recent', 'spent', 'bookings', 'name') then
    raise exception 'invalid_sort' using errcode = 'P0001';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_page' using errcode = 'P0001';
  end if;

  -- phone search: digits only, a local "09…" becomes "639…" to match +639…
  v_digits := regexp_replace(coalesce(v_search, ''), '\D', '', 'g');
  if v_digits like '0%' then
    v_digits := '63' || substr(v_digits, 2);
  end if;
  if char_length(v_digits) < 3 then
    v_digits := null;
  end if;

  return query
  with
  b as (
    select bk.contact_phone as k,
           bk.user_id,
           bk.contact_name,
           bk.contact_email,
           bk.start_at,
           bk.created_at,
           bk.hours,
           (bk.status = 'confirmed'
             or (bk.status = 'cancel_requested' and bk.status_before_request = 'confirmed')) as counted,
           bk.court_fee + bk.paddle_fee as paid,
           coalesce((
             select sum(r.cancel_fee)
             from public.refunds r
             where r.booking_id = bk.id and r.status = 'completed' and bk.cancelled_by = 'customer'
           ), 0)::integer as fee_kept
    from public.bookings bk
    where bk.kind = 'customer' and bk.status <> 'expired' and bk.contact_phone is not null
  ),
  acct as (
    select p.id,
           coalesce(p.phone, 'account:' || p.id::text) as k,
           p.full_name,
           p.email,
           p.created_at,
           exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'email') as has_password
    from public.profiles p
    where p.role = 'customer'
  ),
  links as (
    select a.k, a.id from acct a
    union
    select b.k, b.user_id from b join acct a on a.id = b.user_id
  ),
  stats as (
    select b.k,
           count(*) filter (where b.counted)::integer as n,
           count(*) filter (where b.counted and b.user_id is null)::integer as n_guest,
           coalesce(sum(b.hours) filter (where b.counted), 0)::integer as h,
           coalesce(sum(case when b.counted then b.paid else 0 end + b.fee_kept), 0)::integer as spent,
           max(b.start_at) filter (where b.counted and b.start_at <= now()) as last_at,
           min(b.start_at) filter (where b.counted and b.start_at > now()) as next_at,
           min(b.created_at) as first_at,
           (array_agg(b.contact_name order by b.created_at desc))[1] as latest_name,
           (array_agg(b.contact_email order by b.created_at desc))[1] as latest_email,
           string_agg(distinct lower(coalesce(b.contact_name, '') || ' ' || coalesce(b.contact_email, '')), ' ') as haystack
    from b
    group by b.k
  ),
  acc as (
    select l.k,
           jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name, 'email', a.email, 'can_reset', a.has_password)
                     order by a.created_at) as list,
           (array_agg(a.full_name order by a.created_at desc) filter (where a.full_name is not null))[1] as acc_name,
           (array_agg(a.email order by a.created_at desc) filter (where a.email is not null))[1] as acc_email,
           min(a.created_at) as first_at,
           string_agg(lower(coalesce(a.full_name, '') || ' ' || coalesce(a.email, '')), ' ') as haystack
    from links l
    join acct a on a.id = l.id
    group by l.k
  ),
  grp as (
    select stats.k from stats
    union
    select acc.k from acc
  ),
  grp_rows as (
    select case when g.k like '+63%' then g.k end as r_phone,
           coalesce(acc.acc_name, s.latest_name) as r_name,
           coalesce(acc.acc_email, s.latest_email) as r_email,
           coalesce(acc.list, '[]'::jsonb) as r_accounts,
           coalesce(s.n, 0) as r_bookings,
           coalesce(s.n_guest, 0) as r_guest,
           coalesce(s.h, 0) as r_hours,
           coalesce(s.spent, 0) as r_spent,
           s.last_at as r_last,
           s.next_at as r_next,
           least(s.first_at, acc.first_at) as r_first
    from grp g
    left join stats s on s.k = g.k
    left join acc on acc.k = g.k
    where v_search is null
       or position(v_search in coalesce(s.haystack, '') || ' ' || coalesce(acc.haystack, '')) > 0
       or (v_digits is not null and g.k like '+63%' and position(v_digits in substr(g.k, 2)) > 0)
  )
  select r.r_phone, r.r_name, r.r_email, r.r_accounts, r.r_bookings, r.r_guest, r.r_hours, r.r_spent,
         r.r_last, r.r_next, r.r_first,
         (count(*) over ())::integer
  from grp_rows r
  order by
    case when v_sort = 'spent' then r.r_spent end desc nulls last,
    case when v_sort = 'bookings' then r.r_bookings end desc nulls last,
    case when v_sort = 'name' then lower(r.r_name) end asc nulls last,
    greatest(r.r_last, r.r_next) desc nulls last,
    r.r_first desc nulls last,
    r.r_phone
  limit p_limit offset p_offset;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_password_reset_target: may the owner set a new password for this
-- account, given the phone number the customer told them? (SPEC §3)
-- Returns the account's email so the owner can tell the customer how to log in.
--   not_found        no such customer account (owner accounts are never reset here)
--   not_resettable   the account has no email/password login
--   no_phone_on_file the profile has no phone to verify against
--   phone_mismatch   the phone doesn't match the one on the profile
-- p_phone is +639XXXXXXXXX (the app normalizes 09… first).
-- ---------------------------------------------------------------------------
create or replace function public.admin_password_reset_target(p_user_id uuid, p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.require_owner();
  p public.profiles;
begin
  select * into p from public.profiles where id = p_user_id and role = 'customer';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'email') then
    raise exception 'not_resettable' using errcode = 'P0001';
  end if;
  if p.phone is null then
    raise exception 'no_phone_on_file' using errcode = 'P0001';
  end if;
  if p_phone is null or btrim(p_phone) <> p.phone then
    raise exception 'phone_mismatch' using errcode = 'P0001';
  end if;
  return p.email;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_daily_earnings: one row per play date from..to (Manila), zero days
-- included, so the chart has a bar slot for every day. Same rule and grouping
-- as admin_summary; the days add up to its total_earnings.
-- ---------------------------------------------------------------------------
create or replace function public.admin_daily_earnings(p_from date, p_to date)
returns table (
  day            date,
  earnings       integer,
  court_revenue  integer,
  paddle_revenue integer,
  cancel_fees    integer,
  bookings       integer,
  hours          integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.require_owner();
  v_from  timestamptz;
  v_to    timestamptz;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from >= 366 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with in_range as (
    select bk.*, (bk.start_at at time zone 'Asia/Manila')::date as play_day
    from public.bookings bk
    where bk.kind = 'customer' and bk.start_at >= v_from and bk.start_at < v_to
  ),
  counted as (
    select ir.play_day,
           count(*)::integer as n,
           sum(ir.hours)::integer as h,
           sum(ir.court_fee)::integer as court,
           sum(ir.paddle_fee)::integer as paddle
    from in_range ir
    where ir.status = 'confirmed'
       or (ir.status = 'cancel_requested' and ir.status_before_request = 'confirmed')
    group by ir.play_day
  ),
  fees as (
    select ir.play_day, sum(r.cancel_fee)::integer as fee
    from public.refunds r
    join in_range ir on ir.id = r.booking_id
    where r.status = 'completed' and ir.cancelled_by = 'customer'
    group by ir.play_day
  )
  select d::date,
         coalesce(c.court, 0) + coalesce(c.paddle, 0) + coalesce(f.fee, 0),
         coalesce(c.court, 0),
         coalesce(c.paddle, 0),
         coalesce(f.fee, 0),
         coalesce(c.n, 0),
         coalesce(c.h, 0)
  from generate_series(p_from, p_to, interval '1 day') as d
  left join counted c on c.play_day = d::date
  left join fees f on f.play_day = d::date
  order by d;
end;
$$;

-- ---------------------------------------------------------------------------
-- privileges: signed-in users may call them; the owner check is inside
-- ---------------------------------------------------------------------------
revoke all on function public.admin_customers(text, text, integer, integer) from public, anon;
revoke all on function public.admin_password_reset_target(uuid, text) from public, anon;
revoke all on function public.admin_daily_earnings(date, date) from public, anon;

grant execute on function public.admin_customers(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_password_reset_target(uuid, text) to authenticated, service_role;
grant execute on function public.admin_daily_earnings(date, date) to authenticated, service_role;
