-- Cancellation & refund checks (Phase 4). Runs in one transaction and ROLLS BACK (leaves no data).
-- Run after the migration is applied:
--   npx supabase db query --remote -o table -f supabase/checks/refund_checks.sql
-- Settings are pinned inside the transaction (₱250/h, ₱50 paddles, ₱100 fee, 3 h cutoff).
-- Fixtures sit on a day far ahead; the cutoff fixture sits at 3 AM (outside opening
-- hours) two days from now, so live bookings and blocks never overlap them.

begin;

create temp table _results (n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on _results to anon, authenticated;
grant usage, select on sequence _results_n_seq to anon, authenticated;

create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into _results (check_name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;

create function pg_temp.try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlerrm;
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Manila wall-clock hour h on day d
create function pg_temp.at(d date, h int) returns timestamptz
language sql immutable as $$ select (d + make_interval(hours => h))::timestamp at time zone 'Asia/Manila' $$;

-- fixture customer booking inserted directly (as admin): guest (p_hash) or account (p_uid)
create function pg_temp.mk(d date, h int, n int, paddles boolean, st public.booking_status,
                           p_hash text, p_uid uuid, p_fee int default 100) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into public.bookings (
    ref_code, kind, user_id, guest_token_hash, contact_name, contact_email, contact_phone,
    start_at, end_at, hours, paddle_rented, hourly_rate, court_fee, paddle_fee, cancel_fee, total,
    status, hold_expires_at
  ) values (
    private.random_ref_code(), 'customer', p_uid, p_hash, 'Fixture Contact', 'fixture@example.com', '+639990000060',
    pg_temp.at(d, h), pg_temp.at(d, h + n), n, paddles, 250, 250 * n, case when paddles then 50 else 0 end, p_fee,
    250 * n + case when paddles then 50 else 0 end,
    st,
    case when st = 'pending_payment' then now() + interval '15 minutes' end
  ) returning id into v_id;
  return v_id;
end $$;

update public.settings
   set hourly_rate = 250, paddle_fee = 50, hold_minutes = 15, open_hour = 8, close_hour = 24,
       max_advance_days = 365, max_unpaid_bookings = 5, cancel_fee = 100, cancel_cutoff_hours = 3;

do $$
declare
  uo uuid := gen_random_uuid();   -- owner
  uc uuid := gen_random_uuid();   -- customer with an account
  ux uuid := gen_random_uuid();   -- some other customer
  t1 text := 'e2eRefundCheckTokenAAAAAAAAAAAAAAAAAAAAAAA1';
  t2 text := 'e2eRefundCheckTokenBBBBBBBBBBBBBBBBBBBBBBB2';
  h1 text := encode(sha256(convert_to('e2eRefundCheckTokenAAAAAAAAAAAAAAAAAAAAAAA1', 'UTF8')), 'hex');
  today date := (now() at time zone 'Asia/Manila')::date;
  d date := today + 330;
  r text;
  cnt int;
  amt int;
  bC uuid; bR uuid; bU uuid; bA uuid; bX uuid; bLate uuid; bN uuid; bR2 uuid; bO uuid; bE uuid; bZ uuid; blk uuid;
  rid uuid; rid2 uuid;
  b public.bookings;
  rf public.refunds;
  mb record;
  sm record;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (uo, 'e2e+rchk-owner@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Owner Check"}'),
         (uc, 'e2e+rchk-cust@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Cust Check"}'),
         (ux, 'e2e+rchk-other@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Other Check"}');
  update public.profiles set role = 'owner' where id = uo;

  bC := pg_temp.mk(d, 8, 2, true, 'confirmed', h1, null);         -- ₱550, guest
  bR := pg_temp.mk(d, 10, 1, false, 'pending_review', h1, null);  -- ₱250, guest, payment not checked
  bU := pg_temp.mk(d, 12, 1, false, 'pending_payment', h1, null); -- unpaid
  bA := pg_temp.mk(d, 14, 1, false, 'confirmed', null, uc);       -- ₱250, account
  bX := pg_temp.mk(d, 15, 1, false, 'confirmed', h1, null);
  update public.bookings set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now() where id = bX;
  bLate := pg_temp.mk(today + 2, 3, 1, false, 'confirmed', h1, null);
  bR2 := pg_temp.mk(d, 18, 1, false, 'pending_review', h1, null);
  bN := pg_temp.mk(d, 19, 1, false, 'confirmed', h1, null);
  bO := pg_temp.mk(d, 20, 1, true, 'confirmed', null, uc);        -- ₱300
  bE := pg_temp.mk(d, 21, 1, false, 'pending_payment', h1, null);
  update public.bookings set hold_expires_at = now() - interval '1 minute' where id = bE;
  bZ := pg_temp.mk(d, 22, 1, false, 'confirmed', h1, null, 250);  -- fee = total → ₱0 refund
  insert into public.bookings (ref_code, kind, start_at, end_at, hours, status)
  values (private.random_ref_code(), 'block', pg_temp.at(d, 23), pg_temp.at(d, 24), 1, 'blocked')
  returning id into blk;

  -- ---------------- who may call ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.admin_approve_cancellation(%L)', gen_random_uuid()));
  perform pg_temp.chk('anon cannot approve a cancellation', r like 'permission denied%', r);
  r := pg_temp.try(format('select * from public.admin_cancel_booking(%L)', bC));
  perform pg_temp.chk('anon cannot owner-cancel', r like 'permission denied%', r);
  r := pg_temp.try('select count(*) from public.refunds');
  perform pg_temp.chk('anon cannot read refunds', r like 'permission denied%', r);

  perform pg_temp.as_user(uc);
  r := pg_temp.try(format('select public.admin_approve_cancellation(%L)', gen_random_uuid()));
  perform pg_temp.chk('customer approve → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select public.admin_decline_cancellation(%L, %L)', gen_random_uuid(), 'no'));
  perform pg_temp.chk('customer decline → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select * from public.admin_cancel_booking(%L)', bA));
  perform pg_temp.chk('customer owner-cancel → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select public.admin_complete_refund(%L, %L)', gen_random_uuid(), 'x/y.webp'));
  perform pg_temp.chk('customer complete refund → not_owner', r = 'not_owner', r);

  -- ---------------- request_cancellation: who and when ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bC, 'Juan', '+639171234567', t2));
  perform pg_temp.chk('another browser → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L)', bC, 'Juan', '+639171234567'));
  perform pg_temp.chk('no token → not_found', r = 'not_found', r);
  perform pg_temp.as_user(ux);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L)', bA, 'Juan', '+639171234567'));
  perform pg_temp.chk('another account → not_found', r = 'not_found', r);

  perform pg_temp.as_anon();
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bU, 'Juan', '+639171234567', t1));
  perform pg_temp.chk('unpaid booking → not_paid', r = 'not_paid', r);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bX, 'Juan', '+639171234567', t1));
  perform pg_temp.chk('cancelled booking → not_cancellable', r = 'not_cancellable', r);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', blk, 'Juan', '+639171234567', t1));
  perform pg_temp.chk('a block → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bC, '   ', '+639171234567', t1));
  perform pg_temp.chk('blank GCash name → invalid_gcash_name', r = 'invalid_gcash_name', r);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bC, repeat('x', 101), '+639171234567', t1));
  perform pg_temp.chk('101-char GCash name → invalid_gcash_name', r = 'invalid_gcash_name', r);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bC, 'Juan', '09171234567', t1));
  perform pg_temp.chk('GCash number not +639… → invalid_gcash_number', r = 'invalid_gcash_number', r);

  perform pg_temp.as_admin();
  update public.settings set cancel_cutoff_hours = 168;
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bLate, 'Juan', '+639171234567', t1));
  perform pg_temp.chk('inside the cutoff (168 h, starts in ~2 days) → past_cutoff', r = 'past_cutoff', r);
  perform pg_temp.as_admin();
  update public.settings set cancel_cutoff_hours = 3;
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bLate, 'Juan', '+639171234567', t1));
  perform pg_temp.chk('outside the cutoff (3 h) → allowed', r = 'OK', r);

  -- ---------------- request_cancellation: guest, confirmed ----------------
  select refund_id, refund_amount into rid, amt
  from public.request_cancellation(bC, '  Juan Dela Cruz  ', '+639171234567', t1);
  perform pg_temp.chk('guest requests: refund 550 − 100 = 450', rid is not null and amt = 450, amt::text);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = bC;
  perform pg_temp.chk('booking → cancel_requested, remembers confirmed',
    b.status = 'cancel_requested' and b.status_before_request = 'confirmed', b.status::text);
  select * into rf from public.refunds where id = rid;
  perform pg_temp.chk('refund row: requested, fee 100, trimmed name, number',
    rf.status = 'requested' and rf.cancel_fee = 100 and rf.refund_amount = 450
    and rf.gcash_name = 'Juan Dela Cruz' and rf.gcash_number = '+639171234567', rf.gcash_name);
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L, %L)', bC, 'Juan', '+639171234567', t1));
  perform pg_temp.chk('request twice → already_requested', r = 'already_requested', r);
  select count(*) into cnt from public.get_availability(d) where start_at = pg_temp.at(d, 8);
  perform pg_temp.chk('slot stays held while requested', cnt = 1, cnt::text);
  select * into mb from public.my_bookings(t1) where id = bC;
  perform pg_temp.chk('My Bookings shows the request',
    mb.status = 'cancel_requested' and mb.refund_status = 'requested' and mb.refund_amount = 450
    and mb.refund_cancel_fee = 100 and mb.refund_gcash_name = 'Juan Dela Cruz' and not mb.has_refund_proof,
    mb.refund_status::text);
  select * into mb from public.my_bookings(t1) where id = bU;
  perform pg_temp.chk('My Bookings: no refund → refund fields empty',
    mb.refund_status is null and mb.refund_amount is null and mb.has_refund_proof = false, null);

  -- ---------------- request_cancellation: account; RLS on refunds ----------------
  perform pg_temp.as_user(uc);
  select refund_id, refund_amount into rid2, amt
  from public.request_cancellation(bA, 'Cust Check', '+639181234567');
  perform pg_temp.chk('account holder requests: refund 250 − 100 = 150', amt = 150, amt::text);
  select count(*) into cnt from public.refunds where booking_id = bA;
  perform pg_temp.chk('account holder reads own refund row', cnt = 1, cnt::text);
  perform pg_temp.as_user(ux);
  select count(*) into cnt from public.refunds where booking_id = bA;
  perform pg_temp.chk('other account cannot read it', cnt = 0, cnt::text);

  -- ---------------- decline ----------------
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_decline_cancellation(%L, %L)', rid2, '   '));
  perform pg_temp.chk('decline without a reason → invalid_reason', r = 'invalid_reason', r);
  r := pg_temp.try(format('select public.admin_decline_cancellation(%L, %L)', rid2, '  Too close to tournament day.  '));
  perform pg_temp.chk('owner declines', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = bA;
  perform pg_temp.chk('declined → booking back to confirmed', b.status = 'confirmed' and b.status_before_request is null, b.status::text);
  select * into rf from public.refunds where id = rid2;
  perform pg_temp.chk('declined refund: reason trimmed, decider, number erased',
    rf.status = 'declined' and rf.decline_reason = 'Too close to tournament day.' and rf.decided_by = uo
    and rf.gcash_number is null, rf.decline_reason);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_decline_cancellation(%L, %L)', rid2, 'again'));
  perform pg_temp.chk('decline twice → not_requested', r = 'not_requested', r);
  r := pg_temp.try(format('select public.admin_approve_cancellation(%L)', rid2));
  perform pg_temp.chk('approve a declined request → not_requested', r = 'not_requested', r);
  perform pg_temp.as_user(uc);
  select * into mb from public.my_bookings() where id = bA;
  perform pg_temp.chk('My Bookings shows the decline reason',
    mb.status = 'confirmed' and mb.refund_status = 'declined' and mb.refund_decline_reason = 'Too close to tournament day.', null);
  r := pg_temp.try(format('select * from public.request_cancellation(%L, %L, %L)', bA, 'Cust Check', '+639181234567'));
  perform pg_temp.chk('a new request after a decline is allowed', r = 'OK', r);
  select * into mb from public.my_bookings() where id = bA;
  perform pg_temp.chk('My Bookings shows the latest (new) request', mb.refund_status = 'requested', mb.refund_status::text);

  -- ---------------- approve: payment must be verified first ----------------
  perform pg_temp.as_anon();
  select refund_id into rid from public.request_cancellation(bR, 'Juan', '+639171234567', t1);
  perform pg_temp.as_user(uo);
  select * into sm from public.admin_summary(d, d);
  perform pg_temp.chk('summary: an unchecked payment with a request still counts as to review',
    sm.pending_review = 2 and sm.pending_review_amount = 500, sm.pending_review || ' / ' || sm.pending_review_amount);
  r := pg_temp.try(format('select public.admin_approve_cancellation(%L)', rid));
  perform pg_temp.chk('approve before the payment is checked → payment_not_verified', r = 'payment_not_verified', r);
  select public.admin_approve_payment(bR)::text into r;
  perform pg_temp.chk('approving its payment keeps the request open', r = 'cancel_requested', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = bR;
  perform pg_temp.chk('payment verified: previous status now confirmed, reviewer saved',
    b.status = 'cancel_requested' and b.status_before_request = 'confirmed' and b.reviewed_by = uo, b.status_before_request::text);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_approve_payment(%L)', bR));
  perform pg_temp.chk('approve payment twice → not_pending_review', r = 'not_pending_review', r);
  r := pg_temp.try(format('select public.admin_approve_cancellation(%L)', rid));
  perform pg_temp.chk('owner approves the cancellation', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = bR;
  perform pg_temp.chk('approved → booking cancelled by customer',
    b.status = 'cancelled' and b.cancelled_by = 'customer' and b.cancelled_at is not null and b.status_before_request is null, b.status::text);
  select * into rf from public.refunds where id = rid;
  perform pg_temp.chk('approved → refund approved, decider saved, number kept to send',
    rf.status = 'approved' and rf.decided_by = uo and rf.gcash_number = '+639171234567', rf.status::text);
  perform pg_temp.as_anon();
  select count(*) into cnt from public.get_availability(d) where start_at = pg_temp.at(d, 10);
  perform pg_temp.chk('approved cancellation frees the hour', cnt = 0, cnt::text);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_approve_cancellation(%L)', rid));
  perform pg_temp.chk('approve twice → not_requested', r = 'not_requested', r);
  r := pg_temp.try(format('select public.admin_approve_cancellation(%L)', gen_random_uuid()));
  perform pg_temp.chk('approve unknown id → not_found', r = 'not_found', r);

  -- ---------------- complete ----------------
  r := pg_temp.try(format('select public.admin_complete_refund(%L, %L)', rid, bC::text || '/r.webp'));
  perform pg_temp.chk('proof under another booking → invalid_path', r = 'invalid_path', r);
  r := pg_temp.try(format('select public.admin_complete_refund(%L, %L)', rid, bR::text || '/r.webp'));
  perform pg_temp.chk('proof not uploaded → proof_missing', r = 'proof_missing', r);
  perform pg_temp.as_admin();
  insert into storage.objects (bucket_id, name) values ('refund-proofs', bR::text || '/r.webp');
  perform pg_temp.as_user(uo);
  select * into sm from public.admin_summary(d, d);
  perform pg_temp.chk('fee not counted before the refund is completed', sm.cancel_fees = 0, sm.cancel_fees::text);
  r := pg_temp.try(format('select public.admin_complete_refund(%L, %L)', rid, bR::text || '/r.webp'));
  perform pg_temp.chk('owner completes the refund', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into rf from public.refunds where id = rid;
  perform pg_temp.chk('completed: proof saved, completer saved, GCash number erased',
    rf.status = 'completed' and rf.refund_proof_path = bR::text || '/r.webp' and rf.completed_by = uo
    and rf.completed_at is not null and rf.gcash_number is null and rf.gcash_name = 'Juan', rf.status::text);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_complete_refund(%L, %L)', rid, bR::text || '/r.webp'));
  perform pg_temp.chk('complete twice → not_approved', r = 'not_approved', r);
  select * into sm from public.admin_summary(d, d);
  perform pg_temp.chk('summary: fee 100 kept, refund 150 shown', sm.cancel_fees = 100 and sm.refunds = 150,
    sm.cancel_fees || ' / ' || sm.refunds);

  perform pg_temp.as_anon();
  r := public.my_refund_proof(bR, t1);
  perform pg_temp.chk('guest gets the refund screenshot path', r = bR::text || '/r.webp', r);
  r := pg_temp.try(format('select public.my_refund_proof(%L, %L)', bR, t2));
  perform pg_temp.chk('another browser → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.my_refund_proof(%L, %L)', bC, t1));
  perform pg_temp.chk('no completed refund yet → not_found', r = 'not_found', r);
  select * into mb from public.my_bookings(t1) where id = bR;
  perform pg_temp.chk('My Bookings: completed with screenshot',
    mb.status = 'cancelled' and mb.refund_status = 'completed' and mb.has_refund_proof and mb.refund_gcash_number is null, null);

  -- ---------------- rejecting the payment closes an open request ----------------
  select refund_id into rid from public.request_cancellation(bR2, 'Juan', '+639171234567', t1);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_reject_payment(%L, %L)', bR2, 'No GCash payment received.'));
  perform pg_temp.chk('owner rejects the payment of a booking with a request', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = bR2;
  perform pg_temp.chk('→ booking rejected', b.status = 'rejected' and b.status_before_request is null, b.status::text);
  select * into rf from public.refunds where id = rid;
  perform pg_temp.chk('→ request declined with the same reason, number erased',
    rf.status = 'declined' and rf.decline_reason = 'No GCash payment received.' and rf.gcash_number is null, rf.status::text);

  -- ---------------- owner cancel ----------------
  perform pg_temp.as_user(uo);
  select refund_id, refund_amount into rid2, amt from public.admin_cancel_booking(bC);
  perform pg_temp.chk('owner cancels a booking with an open request: full 550', amt = 550, amt::text);
  perform pg_temp.as_admin();
  select * into rf from public.refunds where booking_id = bC and status <> 'declined';
  perform pg_temp.chk('the open request becomes the full refund (same row, fee 0, approved, request details)',
    rf.id = rid2 and rf.cancel_fee = 0 and rf.refund_amount = 550 and rf.status = 'approved'
    and rf.gcash_name = 'Juan Dela Cruz' and rf.gcash_number = '+639171234567', rf.gcash_name);
  select * into b from public.bookings where id = bC;
  perform pg_temp.chk('booking cancelled by owner', b.status = 'cancelled' and b.cancelled_by = 'owner', b.cancelled_by::text);

  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select * from public.admin_cancel_booking(%L, %L, %L)', bO, 'Cust', '0918'));
  perform pg_temp.chk('owner cancel with a bad number → invalid_gcash_number', r = 'invalid_gcash_number', r);
  select refund_id, refund_amount into rid2, amt from public.admin_cancel_booking(bO, '  Cust Check  ', '+639181234567');
  perform pg_temp.chk('owner cancels a confirmed booking: full 300', amt = 300 and rid2 is not null, amt::text);
  perform pg_temp.as_admin();
  select * into rf from public.refunds where id = rid2;
  perform pg_temp.chk('new refund: approved, fee 0, entered details',
    rf.status = 'approved' and rf.cancel_fee = 0 and rf.refund_amount = 300 and rf.decided_by = uo
    and rf.gcash_name = 'Cust Check' and rf.gcash_number = '+639181234567', rf.gcash_name);

  perform pg_temp.as_user(uo);
  select refund_id, refund_amount into rid2, amt from public.admin_cancel_booking(bN);
  perform pg_temp.as_admin();
  select * into rf from public.refunds where id = rid2;
  perform pg_temp.chk('no details entered, no request → booking contact name + phone',
    rf.gcash_name = 'Fixture Contact' and rf.gcash_number = '+639990000060', rf.gcash_name);

  perform pg_temp.as_user(uo);
  select refund_id, refund_amount into rid2, amt from public.admin_cancel_booking(bU);
  perform pg_temp.chk('owner cancels an unpaid booking: no refund', rid2 is null and amt = 0, coalesce(rid2::text, 'null'));
  perform pg_temp.as_admin();
  select count(*) into cnt from public.refunds where booking_id = bU;
  perform pg_temp.chk('unpaid owner cancel creates no refund row', cnt = 0, cnt::text);
  perform pg_temp.chk('unpaid booking cancelled by owner',
    (select status = 'cancelled' and cancelled_by = 'owner' from public.bookings where id = bU), null);

  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select * from public.admin_cancel_booking(%L)', bX));
  perform pg_temp.chk('owner cancel of a cancelled booking → not_cancellable', r = 'not_cancellable', r);
  r := pg_temp.try(format('select * from public.admin_cancel_booking(%L)', bE));
  perform pg_temp.chk('owner cancel of a hold that ran out → not_cancellable (expired)', r = 'not_cancellable', r);
  r := pg_temp.try(format('select * from public.admin_cancel_booking(%L)', blk));
  perform pg_temp.chk('owner cancel of a block → not_found', r = 'not_found', r);

  -- ---------------- ₱0 refund completes at once ----------------
  perform pg_temp.as_anon();
  select refund_id, refund_amount into rid, amt from public.request_cancellation(bZ, 'Juan', '+639171234567', t1);
  perform pg_temp.chk('fee ≥ total → refund ₱0', amt = 0, amt::text);
  perform pg_temp.as_user(uo);
  select public.admin_approve_cancellation(rid)::text into r;
  perform pg_temp.chk('approving a ₱0 refund completes it at once', r = 'completed', r);
  perform pg_temp.as_admin();
  select * into rf from public.refunds where id = rid;
  perform pg_temp.chk('₱0 refund: completed, number erased', rf.status = 'completed' and rf.gcash_number is null, rf.status::text);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 70) as detail from _results order by n;

rollback;
