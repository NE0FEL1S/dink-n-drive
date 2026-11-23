-- Phase 2 · booking functions
-- Spec: docs/SPEC.md §1 (rules), §5 (booking flow), §10 (public availability).
--
-- Every booking rule runs here, not only in the UI. Customers and guests never
-- write to `bookings` directly; they call these functions:
--
--   get_availability(day)                 anyone     taken time ranges only (no customer details)
--   create_booking(...)                   anyone     validates, prices from settings, holds the slot
--   check_payment_upload(id, token)       anyone     may this caller upload a proof now? (before the signed URL)
--   submit_payment_proof(id, path, token) anyone     proof uploaded → pending_review
--   cancel_unpaid_booking(id, token)      anyone     unpaid → cancelled (free, instant)
--   my_bookings(token)                    anyone     the caller's bookings (account and/or this browser)
--   claim_guest_bookings(token)           signed in  attach this browser's guest bookings to the account
--
-- "anyone" functions check ownership themselves: a signed-in caller owns rows
-- with their user_id; a guest proves ownership with the raw device token (from
-- an httpOnly cookie, sent by the server action), which is hashed here and
-- compared with bookings.guest_token_hash. The hash never leaves the database.
--
-- Errors are raised with a short message key (e.g. 'slot_taken'); the server
-- maps keys to friendly text.

-- ---------------------------------------------------------------------------
-- private helpers (not exposed through the API)
-- ---------------------------------------------------------------------------

-- sha-256 hex of a guest device token. Tokens are server-generated base64url
-- strings (32 random bytes → 43 chars); anything else is rejected.
create or replace function private.guest_token_hash(p_token text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_token is null then
    return null;
  end if;
  if p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  return encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
end;
$$;

-- Unpaid holds past their deadline → expired (frees the hours). Run by pg_cron
-- every minute and at the start of create_booking, so cron lag never blocks a slot.
create or replace function private.expire_overdue_holds()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.bookings
       set status = 'expired'
     where status = 'pending_payment'
       and hold_expires_at <= now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

-- 5 characters from an alphabet without look-alikes (no 0, O, 1, I).
-- Not secret: a reference alone gives no access to anything.
create or replace function private.random_ref_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'DND-' || string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::integer, 1), '')
  from generate_series(1, 5);
$$;

-- Does this caller own this booking? (account, or guest browser by token hash)
create or replace function private.owns_booking(p_user_id uuid, p_guest_hash text, p_caller uuid, p_caller_hash text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_caller is not null and p_user_id = p_caller)
      or (p_caller_hash is not null and p_guest_hash = p_caller_hash);
$$;

revoke all on function private.guest_token_hash(text) from public, anon, authenticated;
revoke all on function private.expire_overdue_holds() from public, anon, authenticated;
revoke all on function private.random_ref_code() from public, anon, authenticated;
revoke all on function private.owns_booking(uuid, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_availability: taken hours for one Manila day (customer bookings and owner
-- blocks alike). Time ranges only, never who booked. Holds past their deadline
-- count as free even before the cron job flips them.
-- ---------------------------------------------------------------------------
create or replace function public.get_availability(p_day date)
returns table (start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.start_at, b.end_at
  from public.bookings b
  where b.start_at < ((p_day + 1)::timestamp at time zone 'Asia/Manila')
    and b.end_at > (p_day::timestamp at time zone 'Asia/Manila')
    and (
      b.status in ('pending_review', 'confirmed', 'cancel_requested', 'blocked')
      or (b.status = 'pending_payment' and b.hold_expires_at > now())
    )
  order by b.start_at;
$$;

-- ---------------------------------------------------------------------------
-- create_booking
-- Signed in: contact details come from the profile; a missing name or phone is
-- taken from the arguments and saved to the profile. Guest: name, email and
-- phone (+639XXXXXXXXX) are required, plus the device token.
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_start_at    timestamptz,
  p_hours       integer,
  p_paddles     boolean default false,
  p_name        text default null,
  p_email       text default null,
  p_phone       text default null,
  p_guest_token text default null
)
returns table (booking_id uuid, ref_code text, hold_expires_at timestamptz, total integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid         uuid := auth.uid();
  v_hash        text;
  v_settings    public.settings;
  v_profile     public.profiles;
  v_name        text;
  v_email       text;
  v_phone       text;
  v_today       date := (now() at time zone 'Asia/Manila')::date;
  v_local_start timestamp;
  v_local_end   timestamp;
  v_unpaid      integer;
  v_hold        timestamptz;
  v_court_fee   integer;
  v_paddle_fee  integer;
  v_id          uuid;
  v_ref         text;
  v_attempts    integer := 0;
begin
  -- 1. free hours whose holds ran out (cron runs only once a minute)
  perform private.expire_overdue_holds();

  select * into v_settings from public.settings where id;

  -- 2. time rules
  if p_hours is null or p_hours < 1 then
    raise exception 'invalid_hours' using errcode = 'P0001';
  end if;
  if p_start_at is null or p_start_at <> date_trunc('hour', p_start_at) then
    raise exception 'not_on_the_hour' using errcode = 'P0001';
  end if;
  if p_start_at <= now() then
    raise exception 'in_the_past' using errcode = 'P0001';
  end if;

  v_local_start := p_start_at at time zone 'Asia/Manila';
  v_local_end := v_local_start + make_interval(hours => p_hours);

  if v_local_start::date > v_today + v_settings.max_advance_days then
    raise exception 'too_far_ahead' using errcode = 'P0001';
  end if;
  if extract(hour from v_local_start) < v_settings.open_hour
     or v_local_end > v_local_start::date + make_interval(hours => v_settings.close_hour) then
    raise exception 'outside_opening_hours' using errcode = 'P0001';
  end if;

  -- 3. who is booking
  if v_uid is not null then
    select * into v_profile from public.profiles where id = v_uid;
    v_name := coalesce(v_profile.full_name, nullif(btrim(p_name), ''));
    v_email := coalesce(nullif(lower(btrim(v_profile.email)), ''), nullif(lower(btrim(p_email)), ''));
    v_phone := coalesce(v_profile.phone, nullif(btrim(p_phone), ''));
  else
    if p_guest_token is null then
      raise exception 'invalid_token' using errcode = 'P0001';
    end if;
    v_hash := private.guest_token_hash(p_guest_token);
    v_name := nullif(btrim(p_name), '');
    v_email := nullif(lower(btrim(p_email)), '');
    v_phone := nullif(btrim(p_phone), '');
  end if;

  if v_name is null or char_length(v_name) > 100 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_phone is null or v_phone !~ '^\+639[0-9]{9}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  -- 4. unpaid limit per phone number (lock per phone so two quick taps can't both pass)
  perform pg_advisory_xact_lock(hashtextextended('dnd-unpaid:' || v_phone, 0));
  select count(*) into v_unpaid
  from public.bookings b
  where b.contact_phone = v_phone and b.status = 'pending_payment';
  if v_unpaid >= v_settings.max_unpaid_bookings then
    raise exception 'unpaid_limit' using errcode = 'P0001', detail = v_settings.max_unpaid_bookings::text;
  end if;

  -- 5. prices and fee as of now
  v_court_fee := v_settings.hourly_rate * p_hours;
  v_paddle_fee := case when coalesce(p_paddles, false) then v_settings.paddle_fee else 0 end;
  v_hold := now() + make_interval(mins => v_settings.hold_minutes);

  -- 6. insert; the exclusion constraint rejects overlaps, a ref collision retries
  loop
    v_ref := private.random_ref_code();
    begin
      insert into public.bookings (
        ref_code, kind, user_id, guest_token_hash, contact_name, contact_email, contact_phone,
        start_at, end_at, hours, paddle_rented, hourly_rate, court_fee, paddle_fee, cancel_fee, total,
        status, hold_expires_at
      ) values (
        v_ref, 'customer', v_uid, v_hash, v_name, v_email, v_phone,
        p_start_at, p_start_at + make_interval(hours => p_hours), p_hours, coalesce(p_paddles, false),
        v_settings.hourly_rate, v_court_fee, v_paddle_fee, v_settings.cancel_fee, v_court_fee + v_paddle_fee,
        'pending_payment', v_hold
      )
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

  -- 7. a signed-in customer's missing name / phone are saved for next time
  if v_uid is not null and (v_profile.full_name is null or v_profile.phone is null) then
    update public.profiles
       set full_name = coalesce(full_name, v_name),
           phone = coalesce(phone, v_phone)
     where id = v_uid;
  end if;

  return query select v_id, v_ref, v_hold, v_court_fee + v_paddle_fee;
end;
$$;

-- ---------------------------------------------------------------------------
-- check_payment_upload: called by the server action before it issues a signed
-- upload URL into payment-proofs/<booking_id>/…
-- ---------------------------------------------------------------------------
create or replace function public.check_payment_upload(p_booking_id uuid, p_guest_token text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text := private.guest_token_hash(p_guest_token);
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or not private.owns_booking(b.user_id, b.guest_token_hash, auth.uid(), v_hash) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if b.status <> 'pending_payment' then
    raise exception 'not_awaiting_payment' using errcode = 'P0001';
  end if;
  if b.hold_expires_at <= now() then
    raise exception 'hold_expired' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_payment_proof: the file is already in storage (signed upload); record it.
-- Accepted while the booking is still pending_payment, i.e. its hours are still
-- held. An upload that finishes a moment after the deadline (before anyone
-- expired the hold) is accepted, with at most 2 minutes of grace.
-- ---------------------------------------------------------------------------
create or replace function public.submit_payment_proof(p_booking_id uuid, p_path text, p_guest_token text default null)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := private.guest_token_hash(p_guest_token);
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not private.owns_booking(b.user_id, b.guest_token_hash, auth.uid(), v_hash) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if b.status = 'expired' or (b.status = 'pending_payment' and b.hold_expires_at + interval '2 minutes' <= now()) then
    raise exception 'hold_expired' using errcode = 'P0001';
  end if;
  if b.status <> 'pending_payment' then
    raise exception 'not_awaiting_payment' using errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ ('^' || b.id::text || '/[A-Za-z0-9._-]{1,100}$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'payment-proofs' and o.name = p_path) then
    raise exception 'proof_missing' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'pending_review',
         payment_proof_path = p_path,
         payment_submitted_at = now()
   where id = b.id;

  return 'pending_review'::public.booking_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_unpaid_booking: free and instant, any time before it's paid.
-- (Paid bookings use the cancellation-request flow in Phase 4.)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_unpaid_booking(p_booking_id uuid, p_guest_token text default null)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := private.guest_token_hash(p_guest_token);
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not private.owns_booking(b.user_id, b.guest_token_hash, auth.uid(), v_hash) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if b.status <> 'pending_payment' then
    raise exception 'not_awaiting_payment' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_by = 'customer',
         cancelled_at = now()
   where id = b.id;

  return 'cancelled'::public.booking_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_bookings: the caller's bookings, newest play date first. Signed in: the
-- account's bookings plus any still-unclaimed guest bookings from this browser.
-- Guest: this browser's bookings. A hold past its deadline shows as expired.
-- ---------------------------------------------------------------------------
create or replace function public.my_bookings(p_guest_token text default null)
returns table (
  id                    uuid,
  ref_code              text,
  start_at              timestamptz,
  end_at                timestamptz,
  hours                 integer,
  paddle_rented         boolean,
  hourly_rate           integer,
  court_fee             integer,
  paddle_fee            integer,
  cancel_fee            integer,
  total                 integer,
  status                public.booking_status,
  hold_expires_at       timestamptz,
  has_payment_proof     boolean,
  payment_submitted_at  timestamptz,
  reject_reason         text,
  cancelled_by          public.booking_actor,
  cancelled_at          timestamptz,
  contact_name          text,
  contact_email         text,
  contact_phone         text,
  is_guest              boolean,
  created_at            timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, b.ref_code, b.start_at, b.end_at, b.hours, b.paddle_rented,
    b.hourly_rate, b.court_fee, b.paddle_fee, b.cancel_fee, b.total,
    case when b.status = 'pending_payment' and b.hold_expires_at <= now()
         then 'expired'::public.booking_status else b.status end,
    case when b.status = 'pending_payment' then b.hold_expires_at end,
    b.payment_proof_path is not null,
    b.payment_submitted_at, b.reject_reason, b.cancelled_by, b.cancelled_at,
    b.contact_name, b.contact_email, b.contact_phone,
    b.user_id is null,
    b.created_at
  from public.bookings b
  cross join (select auth.uid() as uid, private.guest_token_hash(p_guest_token) as hash) c
  where b.kind = 'customer'
    and (b.user_id = c.uid or b.guest_token_hash = c.hash)  -- nulls never match
  order by b.start_at desc;
$$;

-- ---------------------------------------------------------------------------
-- claim_guest_bookings: after a guest signs in on the same browser, their guest
-- bookings move to the account (so they show on any device). Returns how many.
-- ---------------------------------------------------------------------------
create or replace function public.claim_guest_bookings(p_guest_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := private.guest_token_hash(p_guest_token);
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if v_hash is null then
    return 0;
  end if;
  update public.bookings
     set user_id = v_uid,
         guest_token_hash = null
   where kind = 'customer' and guest_token_hash = v_hash;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- privileges: nothing callable by default; then exactly what each role needs
-- ---------------------------------------------------------------------------
revoke all on function public.get_availability(date) from public;
revoke all on function public.create_booking(timestamptz, integer, boolean, text, text, text, text) from public;
revoke all on function public.check_payment_upload(uuid, text) from public;
revoke all on function public.submit_payment_proof(uuid, text, text) from public;
revoke all on function public.cancel_unpaid_booking(uuid, text) from public;
revoke all on function public.my_bookings(text) from public;
revoke all on function public.claim_guest_bookings(text) from public, anon;

grant execute on function public.get_availability(date) to anon, authenticated, service_role;
grant execute on function public.create_booking(timestamptz, integer, boolean, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.check_payment_upload(uuid, text) to anon, authenticated, service_role;
grant execute on function public.submit_payment_proof(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.cancel_unpaid_booking(uuid, text) to anon, authenticated, service_role;
grant execute on function public.my_bookings(text) to anon, authenticated, service_role;
grant execute on function public.claim_guest_bookings(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- pg_cron: expire unpaid holds every minute (re-runnable)
-- ---------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'expire-unpaid-holds';
select cron.schedule('expire-unpaid-holds', '* * * * *', 'select private.expire_overdue_holds()');
