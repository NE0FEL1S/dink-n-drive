-- Phase 4 · cancellation & refund functions
-- Spec: docs/SPEC.md §5 (statuses), §6 (cancellation & refunds), §9 (earnings rule).
--
--   request_cancellation(id, name, number, token)   anyone     paid booking → cancel_requested + refund 'requested'
--   my_refund_proof(id, token)                      anyone     path of this booking's refund screenshot (server signs it)
--   my_bookings(token)                              anyone     now also returns the booking's latest refund
--   admin_approve_cancellation(refund)              owner      → booking cancelled (customer), refund 'approved'
--   admin_decline_cancellation(refund, reason)      owner      → booking back to its previous status, refund 'declined'
--   admin_cancel_booking(id, name?, number?)        owner      any customer booking, any time, full refund, no fee
--   admin_complete_refund(refund, proof_path)       owner      GCash sent → 'completed', GCash number erased
--
-- Changed from Phase 3:
--   admin_approve_payment / admin_reject_payment also work on a cancel_requested
--   booking whose payment wasn't checked yet (status_before_request =
--   'pending_review'). Approving keeps the request open with the payment now
--   verified; rejecting closes the request (refund 'declined', nothing to send).
--   admin_summary counts those bookings as payments to review.
--
-- A cancellation request can't be approved until its payment is verified
-- ('payment_not_verified'): the owner never refunds money that may not exist.
--
-- Lock order everywhere: the booking row first, then its refund row.

-- ---------------------------------------------------------------------------
-- private helpers
-- ---------------------------------------------------------------------------

-- GCash account name: trimmed, 1–100 characters.
create or replace function private.clean_gcash_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(p_name), '');
begin
  if v is null or char_length(v) > 100 then
    raise exception 'invalid_gcash_name' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- GCash number: PH mobile in +639XXXXXXXXX form (the server action normalizes 09… input).
create or replace function private.clean_gcash_number(p_number text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(p_number), '');
begin
  if v is null or v !~ '^\+639[0-9]{9}$' then
    raise exception 'invalid_gcash_number' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

revoke all on function private.clean_gcash_name(text) from public, anon, authenticated;
revoke all on function private.clean_gcash_number(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- request_cancellation: the customer (account or this browser) asks to cancel
-- a paid booking, up to settings.cancel_cutoff_hours before it starts. The
-- slot stays held while the owner decides. Refund = total − the fee saved on
-- the booking when it was made.
-- ---------------------------------------------------------------------------
create or replace function public.request_cancellation(
  p_booking_id   uuid,
  p_gcash_name   text,
  p_gcash_number text,
  p_guest_token  text default null
)
returns table (refund_id uuid, refund_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_hash   text := private.guest_token_hash(p_guest_token);
  v_name   text;
  v_number text;
  v_cutoff integer;
  v_amount integer;
  v_id     uuid;
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id and kind = 'customer' for update;
  if not found or not private.owns_booking(b.user_id, b.guest_token_hash, auth.uid(), v_hash) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if b.status = 'pending_payment' then
    raise exception 'not_paid' using errcode = 'P0001';  -- use cancel_unpaid_booking
  end if;
  if b.status = 'cancel_requested' then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;
  if b.status not in ('pending_review', 'confirmed') then
    raise exception 'not_cancellable' using errcode = 'P0001', detail = b.status::text;
  end if;

  select cancel_cutoff_hours into v_cutoff from public.settings where id;
  if now() > b.start_at - make_interval(hours => v_cutoff) then
    raise exception 'past_cutoff' using errcode = 'P0001', detail = v_cutoff::text;
  end if;

  v_name := private.clean_gcash_name(p_gcash_name);
  v_number := private.clean_gcash_number(p_gcash_number);
  v_amount := greatest(b.total - b.cancel_fee, 0);

  begin
    insert into public.refunds (booking_id, cancel_fee, refund_amount, gcash_name, gcash_number, status)
    values (b.id, b.cancel_fee, v_amount, v_name, v_number, 'requested')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_requested' using errcode = 'P0001';
  end;

  update public.bookings
     set status = 'cancel_requested',
         status_before_request = b.status
   where id = b.id;

  return query select v_id, v_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_bookings: same as Phase 2, plus the booking's current refund: the live
-- (non-declined) one if any — there is at most one — else the newest decline.
-- The return type changes, so the function is dropped and recreated.
-- ---------------------------------------------------------------------------
drop function public.my_bookings(text);

create function public.my_bookings(p_guest_token text default null)
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
  created_at            timestamptz,
  refund_status         public.refund_status,
  refund_amount         integer,
  refund_cancel_fee     integer,
  refund_gcash_name     text,
  refund_gcash_number   text,
  refund_requested_at   timestamptz,
  refund_decided_at     timestamptz,
  refund_decline_reason text,
  refund_completed_at   timestamptz,
  has_refund_proof      boolean
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
    b.created_at,
    r.status, r.refund_amount, r.cancel_fee, r.gcash_name, r.gcash_number,
    r.requested_at, r.decided_at, r.decline_reason, r.completed_at,
    coalesce(r.refund_proof_path is not null, false)
  from public.bookings b
  cross join (select auth.uid() as uid, private.guest_token_hash(p_guest_token) as hash) c
  left join lateral (
    select * from public.refunds x
    where x.booking_id = b.id
    order by x.status = 'declined', x.created_at desc  -- the one live refund, else the newest decline
    limit 1
  ) r on true
  where b.kind = 'customer'
    and (b.user_id = c.uid or b.guest_token_hash = c.hash)  -- nulls never match
  order by b.start_at desc;
$$;

-- ---------------------------------------------------------------------------
-- my_refund_proof: storage path of the refund screenshot for one of the
-- caller's bookings. Guests can't read storage, so the server action checks
-- ownership here and then signs a short-lived URL with the secret key.
-- ---------------------------------------------------------------------------
create or replace function public.my_refund_proof(p_booking_id uuid, p_guest_token text default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text := private.guest_token_hash(p_guest_token);
  v_path text;
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id and kind = 'customer';
  if not found or not private.owns_booking(b.user_id, b.guest_token_hash, auth.uid(), v_hash) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select r.refund_proof_path into v_path
  from public.refunds r
  where r.booking_id = b.id and r.status = 'completed' and r.refund_proof_path is not null
  order by r.completed_at desc
  limit 1;
  if v_path is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_approve_cancellation: the owner accepts a customer's request. The fee
-- saved on the booking is kept; the rest is sent by GCash and then marked
-- completed. A ₱0 refund (fee ≥ total) has nothing to send and completes at once.
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_cancellation(p_refund_id uuid)
returns public.refund_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner  uuid := private.require_owner();
  v_status public.refund_status;
  b public.bookings;
  r public.refunds;
begin
  select * into b from public.bookings
   where id = (select booking_id from public.refunds where id = p_refund_id)
   for update;
  select * into r from public.refunds where id = p_refund_id for update;
  if r.id is null or b.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.status <> 'requested' or b.status <> 'cancel_requested' then
    raise exception 'not_requested' using errcode = 'P0001', detail = r.status::text;
  end if;
  if b.status_before_request = 'pending_review' then
    raise exception 'payment_not_verified' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_by = 'customer',
         cancelled_at = now(),
         status_before_request = null
   where id = b.id;

  if r.refund_amount = 0 then
    v_status := 'completed';
    update public.refunds
       set status = 'completed', decided_by = v_owner, decided_at = now(),
           completed_by = v_owner, completed_at = now(), gcash_number = null
     where id = r.id;
  else
    v_status := 'approved';
    update public.refunds
       set status = 'approved', decided_by = v_owner, decided_at = now()
     where id = r.id;
  end if;

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_decline_cancellation: the owner says no (reason shown to the customer).
-- The booking goes back to where it was; the GCash number is no longer needed
-- and is erased. The customer may send a new request before the cutoff.
-- ---------------------------------------------------------------------------
create or replace function public.admin_decline_cancellation(p_refund_id uuid, p_reason text)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner  uuid := private.require_owner();
  v_reason text := nullif(btrim(p_reason), '');
  b public.bookings;
  r public.refunds;
begin
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  select * into b from public.bookings
   where id = (select booking_id from public.refunds where id = p_refund_id)
   for update;
  select * into r from public.refunds where id = p_refund_id for update;
  if r.id is null or b.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.status <> 'requested' or b.status <> 'cancel_requested' then
    raise exception 'not_requested' using errcode = 'P0001', detail = r.status::text;
  end if;

  update public.bookings
     set status = b.status_before_request,
         status_before_request = null
   where id = b.id;

  update public.refunds
     set status = 'declined', decline_reason = v_reason, decided_by = v_owner, decided_at = now(),
         gcash_number = null
   where id = r.id;

  return b.status_before_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_cancel_booking: the owner cancels any customer booking at any time,
-- no cutoff, no fee. Unpaid → just cancelled. Paid (pending_review, confirmed,
-- or with a request open) → full refund, already approved. GCash details: what
-- the owner enters, else the customer's open request, else the booking contact.
-- ---------------------------------------------------------------------------
create or replace function public.admin_cancel_booking(
  p_booking_id   uuid,
  p_gcash_name   text default null,
  p_gcash_number text default null
)
returns table (refund_id uuid, refund_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_owner  uuid := private.require_owner();
  v_name   text;
  v_number text;
  v_id     uuid;
  b public.bookings;
  r public.refunds;
begin
  -- a hold that ran out is already expired, not cancellable
  perform private.expire_overdue_holds();

  select * into b from public.bookings where id = p_booking_id and kind = 'customer' for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if b.status not in ('pending_payment', 'pending_review', 'confirmed', 'cancel_requested') then
    raise exception 'not_cancellable' using errcode = 'P0001', detail = b.status::text;
  end if;

  if b.status = 'pending_payment' then
    update public.bookings
       set status = 'cancelled', cancelled_by = 'owner', cancelled_at = now()
     where id = b.id;
    return query select null::uuid, 0;
    return;
  end if;

  select * into r from public.refunds x
   where x.booking_id = b.id and x.status = 'requested'
   for update;

  v_name := private.clean_gcash_name(coalesce(nullif(btrim(p_gcash_name), ''), r.gcash_name, b.contact_name));
  v_number := private.clean_gcash_number(coalesce(nullif(btrim(p_gcash_number), ''), r.gcash_number, b.contact_phone));

  update public.bookings
     set status = 'cancelled', cancelled_by = 'owner', cancelled_at = now(), status_before_request = null
   where id = b.id;

  if r.id is not null then
    update public.refunds
       set cancel_fee = 0, refund_amount = b.total, gcash_name = v_name, gcash_number = v_number,
           status = 'approved', decided_by = v_owner, decided_at = now()
     where id = r.id;
    v_id := r.id;
  else
    insert into public.refunds (booking_id, cancel_fee, refund_amount, gcash_name, gcash_number, status, decided_by, decided_at)
    values (b.id, 0, b.total, v_name, v_number, 'approved', v_owner, now())
    returning id into v_id;
  end if;

  return query select v_id, b.total;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_complete_refund: the owner sent the GCash refund and uploaded the
-- screenshot to refund-proofs/<booking_id>/… → completed. The GCash number
-- is erased; the kept fee now counts as earnings.
-- ---------------------------------------------------------------------------
create or replace function public.admin_complete_refund(p_refund_id uuid, p_proof_path text)
returns public.refund_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.require_owner();
  r public.refunds;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.status <> 'approved' then
    raise exception 'not_approved' using errcode = 'P0001', detail = r.status::text;
  end if;
  if p_proof_path is null or p_proof_path !~ ('^' || r.booking_id::text || '/[A-Za-z0-9._-]{1,100}$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'refund-proofs' and o.name = p_proof_path) then
    raise exception 'proof_missing' using errcode = 'P0001';
  end if;

  update public.refunds
     set status = 'completed', refund_proof_path = p_proof_path,
         completed_by = v_owner, completed_at = now(), gcash_number = null
   where id = r.id;

  return 'completed'::public.refund_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_approve_payment (replaces Phase 3): also verifies the payment of a
-- booking whose cancellation request is open; the request stays open.
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

  if b.status = 'pending_review' then
    update public.bookings
       set status = 'confirmed', reviewed_by = v_owner, reviewed_at = now(), reject_reason = null
     where id = b.id;
    return 'confirmed'::public.booking_status;
  end if;

  if b.status = 'cancel_requested' and b.status_before_request = 'pending_review' then
    update public.bookings
       set status_before_request = 'confirmed', reviewed_by = v_owner, reviewed_at = now(), reject_reason = null
     where id = b.id;
    return 'cancel_requested'::public.booking_status;
  end if;

  raise exception 'not_pending_review' using errcode = 'P0001', detail = b.status::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_reject_payment (replaces Phase 3): rejecting the payment of a booking
-- whose cancellation request is open also closes the request — nothing was
-- paid, so nothing is refunded.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reject_payment(p_booking_id uuid, p_reason text)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner  uuid := private.require_owner();
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
  if not (b.status = 'pending_review'
          or (b.status = 'cancel_requested' and b.status_before_request = 'pending_review')) then
    raise exception 'not_pending_review' using errcode = 'P0001', detail = b.status::text;
  end if;

  update public.bookings
     set status = 'rejected', status_before_request = null,
         reviewed_by = v_owner, reviewed_at = now(), reject_reason = v_reason
   where id = b.id;

  update public.refunds
     set status = 'declined', decline_reason = v_reason, decided_by = v_owner, decided_at = now(),
         gcash_number = null
   where booking_id = b.id and status = 'requested';

  return 'rejected'::public.booking_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_summary (replaces Phase 3): "pending review" also counts bookings with
-- an open cancellation request whose payment hasn't been checked yet.
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
    from in_range
    where status = 'pending_review'
       or (status = 'cancel_requested' and status_before_request = 'pending_review')
  )
  select c.court + c.paddle + f.fees, c.court, c.paddle, f.fees, f.refunded, c.n, c.h, p.n, p.amount
  from c, f, p;
end;
$$;

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------
revoke all on function public.request_cancellation(uuid, text, text, text) from public;
revoke all on function public.my_bookings(text) from public;
revoke all on function public.my_refund_proof(uuid, text) from public;
revoke all on function public.admin_approve_cancellation(uuid) from public, anon;
revoke all on function public.admin_decline_cancellation(uuid, text) from public, anon;
revoke all on function public.admin_cancel_booking(uuid, text, text) from public, anon;
revoke all on function public.admin_complete_refund(uuid, text) from public, anon;

grant execute on function public.request_cancellation(uuid, text, text, text) to anon, authenticated, service_role;
grant execute on function public.my_bookings(text) to anon, authenticated, service_role;
grant execute on function public.my_refund_proof(uuid, text) to anon, authenticated, service_role;
grant execute on function public.admin_approve_cancellation(uuid) to authenticated, service_role;
grant execute on function public.admin_decline_cancellation(uuid, text) to authenticated, service_role;
grant execute on function public.admin_cancel_booking(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_complete_refund(uuid, text) to authenticated, service_role;
