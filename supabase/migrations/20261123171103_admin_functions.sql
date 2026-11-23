-- Phase 3 · owner (admin) functions
-- Spec: docs/SPEC.md §4 (Owner pages), §5 (statuses, owner blocks), §9 (earnings rule).
--
--   admin_approve_payment(id)              pending_review → confirmed
--   admin_reject_payment(id, reason)       pending_review → rejected (hours reopen)
--   admin_create_block(start, hours, note) block hours (maintenance, events, weather)
--   admin_remove_block(id)                 delete a block (hours reopen)
--   admin_summary(from, to)                summary cards for play dates from..to (Manila)
--
-- The owner already has full RLS access to bookings and settings; these
-- functions are the app's path so status changes follow the rules in one place.
-- Every function checks the owner role itself and is callable only by
-- signed-in users. Errors are raised as short message keys, like Phase 2.

-- ---------------------------------------------------------------------------
-- private helper
-- ---------------------------------------------------------------------------
create or replace function private.require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  return auth.uid();
end;
$$;

revoke all on function private.require_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_approve_payment: the owner checked the GCash screenshot → confirmed.
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_payment(p_booking_id uuid)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.require_owner();
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id and kind = 'customer' for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if b.status <> 'pending_review' then
    raise exception 'not_pending_review' using errcode = 'P0001', detail = b.status::text;
  end if;

  update public.bookings
     set status = 'confirmed',
         reviewed_by = v_owner,
         reviewed_at = now(),
         reject_reason = null
   where id = b.id;

  return 'confirmed'::public.booking_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_reject_payment: screenshot doesn't check out → rejected with a reason
-- the customer sees in My Bookings. Rejected isn't an active status, so the
-- hours reopen at once.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reject_payment(p_booking_id uuid, p_reason text)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.require_owner();
  v_reason text := nullif(btrim(p_reason), '');
  b public.bookings;
begin
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  select * into b from public.bookings where id = p_booking_id and kind = 'customer' for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if b.status <> 'pending_review' then
    raise exception 'not_pending_review' using errcode = 'P0001', detail = b.status::text;
  end if;

  update public.bookings
     set status = 'rejected',
         reviewed_by = v_owner,
         reviewed_at = now(),
         reject_reason = v_reason
   where id = b.id;

  return 'rejected'::public.booking_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_create_block: owner blocks consecutive whole hours on one day.
-- Same shape rules as bookings (on the hour, inside opening hours), but no
-- booking-window limit: the owner may block a date further ahead than
-- customers can book. The current hour can be blocked; earlier hours can't.
-- A block can't cover an active customer booking (cancel that first).
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_block(
  p_start_at timestamptz,
  p_hours    integer,
  p_note     text default null
)
returns table (booking_id uuid, ref_code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_owner       uuid := private.require_owner();
  v_settings    public.settings;
  v_note        text := nullif(btrim(p_note), '');
  v_local_start timestamp;
  v_local_end   timestamp;
  v_id          uuid;
  v_ref         text;
  v_attempts    integer := 0;
begin
  -- holds that ran out shouldn't stop the owner
  perform private.expire_overdue_holds();

  select * into v_settings from public.settings where id;

  if p_hours is null or p_hours < 1 then
    raise exception 'invalid_hours' using errcode = 'P0001';
  end if;
  if p_start_at is null or p_start_at <> date_trunc('hour', p_start_at) then
    raise exception 'not_on_the_hour' using errcode = 'P0001';
  end if;
  if p_start_at < date_trunc('hour', now()) then
    raise exception 'in_the_past' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;

  v_local_start := p_start_at at time zone 'Asia/Manila';
  v_local_end := v_local_start + make_interval(hours => p_hours);
  if extract(hour from v_local_start) < v_settings.open_hour
     or v_local_end > v_local_start::date + make_interval(hours => v_settings.close_hour) then
    raise exception 'outside_opening_hours' using errcode = 'P0001';
  end if;

  loop
    v_ref := private.random_ref_code();
    begin
      insert into public.bookings (ref_code, kind, start_at, end_at, hours, status, block_note)
      values (v_ref, 'block', p_start_at, p_start_at + make_interval(hours => p_hours), p_hours, 'blocked', v_note)
      returning id into v_id;
      exit;
    exception
      when exclusion_violation then
        raise exception 'slot_taken' using errcode = 'P0001';
      when unique_violation then
        v_attempts := v_attempts + 1;
        if v_attempts >= 5 then
          raise;
        end if;
    end;
  end loop;

  return query select v_id, v_ref;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_remove_block: deleting the row reopens the hours.
-- ---------------------------------------------------------------------------
create or replace function public.admin_remove_block(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.require_owner();
begin
  delete from public.bookings where id = p_booking_id and kind = 'block';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_summary: the Overview / Bookings summary cards for play dates
-- p_from..p_to (inclusive, Asia/Manila). Earnings rule (SPEC §9):
--   * counted bookings = confirmed customer bookings, plus cancel_requested
--     ones that were confirmed before the request (they count until approved)
--   * cancellation fees = fees kept from customer cancellations whose refund
--     is marked completed (owner cancellations keep ₱0)
--   * total earnings = court revenue + paddle revenue + cancellation fees
--   * refunds = money sent back on completed refunds (shown, not subtracted:
--     a refunded booking is already out of the counted set)
--   * bookings / hours = counted bookings only
--   * pending_review = bookings with a screenshot waiting for the owner
-- Everything is grouped by the booking's play date (start_at in Manila).
-- ---------------------------------------------------------------------------
create or replace function public.admin_summary(p_from date, p_to date)
returns table (
  total_earnings        integer,
  court_revenue         integer,
  paddle_revenue        integer,
  cancel_fees           integer,
  refunds               integer,
  bookings              integer,
  hours                 integer,
  pending_review        integer,
  pending_review_amount integer
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
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with in_range as (
    select b.*
    from public.bookings b
    where b.kind = 'customer' and b.start_at >= v_from and b.start_at < v_to
  ),
  counted as (
    select * from in_range b
    where b.status = 'confirmed'
       or (b.status = 'cancel_requested' and b.status_before_request = 'confirmed')
  ),
  done_refunds as (
    select r.cancel_fee, r.refund_amount, b.cancelled_by
    from public.refunds r
    join in_range b on b.id = r.booking_id
    where r.status = 'completed'
  ),
  c as (
    select coalesce(sum(court_fee), 0)::integer as court,
           coalesce(sum(paddle_fee), 0)::integer as paddle,
           count(*)::integer as n,
           coalesce(sum(counted.hours), 0)::integer as h
    from counted
  ),
  f as (
    select coalesce(sum(cancel_fee) filter (where cancelled_by = 'customer'), 0)::integer as fees,
           coalesce(sum(refund_amount), 0)::integer as refunded
    from done_refunds
  ),
  p as (
    select count(*)::integer as n, coalesce(sum(total), 0)::integer as amount
    from in_range where status = 'pending_review'
  )
  select c.court + c.paddle + f.fees, c.court, c.paddle, f.fees, f.refunded, c.n, c.h, p.n, p.amount
  from c, f, p;
end;
$$;

-- ---------------------------------------------------------------------------
-- settings: remember who changed them last (the owner, via RLS)
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

revoke all on function private.set_updated_by() from public, anon, authenticated;

create trigger settings_set_updated_by
  before update on public.settings
  for each row execute function private.set_updated_by();

-- ---------------------------------------------------------------------------
-- privileges: signed-in users may call them; the owner check is inside
-- ---------------------------------------------------------------------------
revoke all on function public.admin_approve_payment(uuid) from public, anon;
revoke all on function public.admin_reject_payment(uuid, text) from public, anon;
revoke all on function public.admin_create_block(timestamptz, integer, text) from public, anon;
revoke all on function public.admin_remove_block(uuid) from public, anon;
revoke all on function public.admin_summary(date, date) from public, anon;

grant execute on function public.admin_approve_payment(uuid) to authenticated, service_role;
grant execute on function public.admin_reject_payment(uuid, text) to authenticated, service_role;
grant execute on function public.admin_create_block(timestamptz, integer, text) to authenticated, service_role;
grant execute on function public.admin_remove_block(uuid) to authenticated, service_role;
grant execute on function public.admin_summary(date, date) to authenticated, service_role;
