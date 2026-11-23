-- Owner (admin) function checks (Phase 3). Runs in one transaction and ROLLS BACK (leaves no data).
-- Run after the migration is applied:
--   npx supabase db query --remote -o table -f supabase/checks/admin_checks.sql
-- Settings are pinned inside the transaction (₱250/h, ₱50 paddles, 8 AM–midnight, 365 days ahead,
-- 5 unpaid per phone, ₱100 fee). Test days are far ahead so live bookings don't change the numbers.

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

-- fixture customer booking inserted directly (as admin), already in the given state
create function pg_temp.mk(d date, h int, n int, paddles boolean, st public.booking_status) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into public.bookings (
    ref_code, kind, guest_token_hash, contact_name, contact_email, contact_phone,
    start_at, end_at, hours, paddle_rented, hourly_rate, court_fee, paddle_fee, cancel_fee, total,
    status, hold_expires_at, status_before_request, cancelled_by, cancelled_at
  ) values (
    private.random_ref_code(), 'customer', repeat('c', 64), 'Fixture', 'fixture@example.com', '+639990000050',
    pg_temp.at(d, h), pg_temp.at(d, h + n), n, paddles, 250, 250 * n, case when paddles then 50 else 0 end, 100,
    250 * n + case when paddles then 50 else 0 end,
    st,
    case when st = 'pending_payment' then now() + interval '15 minutes' end,
    case when st = 'cancel_requested' then 'confirmed'::public.booking_status end,
    case when st = 'cancelled' then 'customer'::public.booking_actor end,
    case when st = 'cancelled' then now() end
  ) returning id into v_id;
  return v_id;
end $$;

update public.settings
   set hourly_rate = 250, paddle_fee = 50, hold_minutes = 15, open_hour = 8, close_hour = 24,
       max_advance_days = 365, max_unpaid_bookings = 5, cancel_fee = 100;

do $$
declare
  uo uuid := gen_random_uuid();   -- owner
  uc uuid := gen_random_uuid();   -- ordinary customer
  t1 text := 'e2eAdminCheckTokenAAAAAAAAAAAAAAAAAAAAAAAA1';
  today date := (now() at time zone 'Asia/Manila')::date;
  d date := today + 300;          -- payment + block checks
  s date := today + 310;          -- summary checks
  r text;
  cnt int;
  v_id uuid; v_id2 uuid; v_ref text; v_st text;
  b public.bookings;
  sm record;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (uo, 'e2e+chk-owner@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Owner Check"}'),
         (uc, 'e2e+chk-cust@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Cust Check"}');
  update public.profiles set role = 'owner' where id = uo;

  -- two guest bookings with uploaded proofs → pending_review
  perform pg_temp.as_anon();
  select booking_id into v_id from public.create_booking(pg_temp.at(d, 10), 2, true, 'Pay Approve', 'approve@example.com', '+639990000041', t1);
  select booking_id into v_id2 from public.create_booking(pg_temp.at(d, 12), 1, false, 'Pay Reject', 'reject@example.com', '+639990000042', t1);
  perform pg_temp.as_admin();
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_id::text || '/p.webp'), ('payment-proofs', v_id2::text || '/p.webp');
  perform pg_temp.as_anon();
  perform public.submit_payment_proof(v_id, v_id::text || '/p.webp', t1);
  perform public.submit_payment_proof(v_id2, v_id2::text || '/p.webp', t1);

  -- ---------------- who may call ----------------
  r := pg_temp.try(format('select public.admin_approve_payment(%L)', v_id));
  perform pg_temp.chk('anon cannot approve', r like 'permission denied%', r);
  r := pg_temp.try(format('select * from public.admin_summary(%L, %L)', d, d));
  perform pg_temp.chk('anon cannot read summary', r like 'permission denied%', r);

  perform pg_temp.as_user(uc);
  r := pg_temp.try(format('select public.admin_approve_payment(%L)', v_id));
  perform pg_temp.chk('customer approve → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select public.admin_reject_payment(%L, %L)', v_id, 'nope'));
  perform pg_temp.chk('customer reject → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, null)', pg_temp.at(d, 20)));
  perform pg_temp.chk('customer block → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select public.admin_remove_block(%L)', v_id));
  perform pg_temp.chk('customer remove block → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select * from public.admin_summary(%L, %L)', d, d));
  perform pg_temp.chk('customer summary → not_owner', r = 'not_owner', r);

  -- ---------------- approve / reject ----------------
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_approve_payment(%L)', v_id));
  perform pg_temp.chk('owner approves pending_review', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = v_id;
  perform pg_temp.chk('approved → confirmed', b.status = 'confirmed', b.status::text);
  perform pg_temp.chk('approved records who and when', b.reviewed_by = uo and b.reviewed_at is not null, null);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_approve_payment(%L)', v_id));
  perform pg_temp.chk('approve twice → not_pending_review', r = 'not_pending_review', r);
  r := pg_temp.try(format('select public.admin_reject_payment(%L, %L)', v_id, 'late'));
  perform pg_temp.chk('reject a confirmed booking → not_pending_review', r = 'not_pending_review', r);
  r := pg_temp.try(format('select public.admin_approve_payment(%L)', gen_random_uuid()));
  perform pg_temp.chk('approve unknown id → not_found', r = 'not_found', r);

  r := pg_temp.try(format('select public.admin_reject_payment(%L, %L)', v_id2, '   '));
  perform pg_temp.chk('reject without a reason → invalid_reason', r = 'invalid_reason', r);
  r := pg_temp.try(format('select public.admin_reject_payment(%L, %L)', v_id2, repeat('x', 501)));
  perform pg_temp.chk('reject with a 501-char reason → invalid_reason', r = 'invalid_reason', r);
  r := pg_temp.try(format('select public.admin_reject_payment(%L, %L)', v_id2, '  Amount on the screenshot is ₱200, not ₱250.  '));
  perform pg_temp.chk('owner rejects with a reason', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = v_id2;
  perform pg_temp.chk('rejected → status + trimmed reason + reviewer',
    b.status = 'rejected' and b.reject_reason = 'Amount on the screenshot is ₱200, not ₱250.' and b.reviewed_by = uo, b.reject_reason);
  perform pg_temp.as_anon();
  select count(*) into cnt from public.get_availability(d) where start_at = pg_temp.at(d, 12);
  perform pg_temp.chk('rejected hour is free again', cnt = 0, cnt::text);
  select status::text into r from public.my_bookings(t1) where id = v_id2;
  perform pg_temp.chk('customer sees rejected in My Bookings', r = 'rejected', r);

  perform pg_temp.as_anon();
  select booking_id into v_id2 from public.create_booking(pg_temp.at(d, 13), 1, false, 'Unpaid', 'unpaid@example.com', '+639990000043', t1);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_approve_payment(%L)', v_id2));
  perform pg_temp.chk('approve without a screenshot (pending_payment) → not_pending_review', r = 'not_pending_review', r);

  -- ---------------- blocks ----------------
  select booking_id, ref_code into v_id2, v_ref from public.admin_create_block(pg_temp.at(d, 15), 2, '  Court resurfacing  ');
  perform pg_temp.chk('owner blocks 3-5 PM', v_id2 is not null and v_ref ~ '^DND-[2-9A-HJ-NP-Z]{5}$', v_ref);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = v_id2;
  perform pg_temp.chk('block row: kind block, status blocked, ₱0, trimmed note',
    b.kind = 'block' and b.status = 'blocked' and b.total = 0 and b.block_note = 'Court resurfacing', b.block_note);
  perform pg_temp.as_anon();
  select count(*) into cnt from public.get_availability(d) where start_at = pg_temp.at(d, 15) and end_at = pg_temp.at(d, 17);
  perform pg_temp.chk('blocked hours show as taken', cnt = 1, cnt::text);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)', pg_temp.at(d, 16), 'Blocked Out', 'blocked@example.com', '+639990000044', t1));
  perform pg_temp.chk('customer cannot book a blocked hour → slot_taken', r = 'slot_taken', r);

  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, null)', pg_temp.at(d, 11)));
  perform pg_temp.chk('block over a confirmed booking → slot_taken', r = 'slot_taken', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, null)', pg_temp.at(d, 13)));
  perform pg_temp.chk('block over an unpaid hold → slot_taken', r = 'slot_taken', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, null)', pg_temp.at(d, 16)));
  perform pg_temp.chk('block over a block → slot_taken', r = 'slot_taken', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, null)', pg_temp.at(d, 7)));
  perform pg_temp.chk('block before opening → outside_opening_hours', r = 'outside_opening_hours', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 2, null)', pg_temp.at(d, 23)));
  perform pg_temp.chk('block past midnight → outside_opening_hours', r = 'outside_opening_hours', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, null)', pg_temp.at(d, 9) + interval '30 minutes'));
  perform pg_temp.chk('block at 9:30 → not_on_the_hour', r = 'not_on_the_hour', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 0, null)', pg_temp.at(d, 9)));
  perform pg_temp.chk('block 0 hours → invalid_hours', r = 'invalid_hours', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, null)', pg_temp.at(today - 1, 9)));
  perform pg_temp.chk('block yesterday → in_the_past', r = 'in_the_past', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 1, %L)', pg_temp.at(d, 9), repeat('x', 201)));
  perform pg_temp.chk('201-char note → invalid_note', r = 'invalid_note', r);
  r := pg_temp.try(format('select * from public.admin_create_block(%L, 16, null)', pg_temp.at(today + 400, 8)));
  perform pg_temp.chk('owner may block a whole day beyond the booking window', r = 'OK', r);

  r := pg_temp.try(format('select public.admin_remove_block(%L)', v_id));
  perform pg_temp.chk('remove_block on a customer booking → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.admin_remove_block(%L)', v_id2));
  perform pg_temp.chk('owner removes the block', r = 'OK', r);
  r := pg_temp.try(format('select public.admin_remove_block(%L)', v_id2));
  perform pg_temp.chk('remove twice → not_found', r = 'not_found', r);
  perform pg_temp.as_anon();
  select count(*) into cnt from public.get_availability(d) where start_at = pg_temp.at(d, 15);
  perform pg_temp.chk('removed block hours are free again', cnt = 0, cnt::text);

  -- ---------------- summary (earnings rule) ----------------
  perform pg_temp.as_admin();
  perform pg_temp.mk(s, 8, 2, true, 'confirmed');           -- counts: 500 court + 50 paddle, 2 h
  perform pg_temp.mk(s, 10, 1, false, 'confirmed');         -- counts: 250, 1 h
  perform pg_temp.mk(s, 11, 1, false, 'cancel_requested');  -- was confirmed → still counts: 250, 1 h
  perform pg_temp.mk(s, 12, 1, true, 'pending_review');     -- pending: 300
  perform pg_temp.mk(s, 13, 1, false, 'pending_payment');   -- ₱0
  perform pg_temp.mk(s, 14, 1, false, 'rejected');          -- ₱0
  perform pg_temp.mk(s, 15, 1, false, 'expired');           -- ₱0
  v_id := pg_temp.mk(s, 16, 1, false, 'cancelled');         -- customer cancel, refund completed: fee 100 kept
  insert into public.refunds (booking_id, cancel_fee, refund_amount, status, completed_at)
  values (v_id, 100, 150, 'completed', now());
  v_id := pg_temp.mk(s, 17, 1, false, 'cancelled');         -- customer cancel, refund only approved: fee not yet
  insert into public.refunds (booking_id, cancel_fee, refund_amount, gcash_name, gcash_number, status, decided_at)
  values (v_id, 100, 150, 'Fixture', '+639990000050', 'approved', now());
  v_id := pg_temp.mk(s, 18, 1, false, 'cancelled');         -- owner cancel: full refund, fee 0
  update public.bookings set cancelled_by = 'owner' where id = v_id;
  insert into public.refunds (booking_id, cancel_fee, refund_amount, status, completed_at)
  values (v_id, 0, 250, 'completed', now());
  perform pg_temp.mk(s, 19, 1, false, 'cancelled');         -- unpaid cancel: no refund row, ₱0
  insert into public.bookings (ref_code, kind, start_at, end_at, hours, status)
  values (private.random_ref_code(), 'block', pg_temp.at(s, 20), pg_temp.at(s, 22), 2, 'blocked');
  perform pg_temp.mk(s + 1, 8, 3, true, 'confirmed');       -- next day: outside a one-day range

  perform pg_temp.as_user(uo);
  select * into sm from public.admin_summary(s, s);
  perform pg_temp.chk('court revenue = 500 + 250 + 250', sm.court_revenue = 1000, sm.court_revenue::text);
  perform pg_temp.chk('paddle revenue = 50', sm.paddle_revenue = 50, sm.paddle_revenue::text);
  perform pg_temp.chk('cancel fees = completed customer refunds only (100)', sm.cancel_fees = 100, sm.cancel_fees::text);
  perform pg_temp.chk('total earnings = 1000 + 50 + 100', sm.total_earnings = 1150, sm.total_earnings::text);
  perform pg_temp.chk('refunds = completed refunds (150 + 250)', sm.refunds = 400, sm.refunds::text);
  perform pg_temp.chk('bookings = 3 counted', sm.bookings = 3, sm.bookings::text);
  perform pg_temp.chk('hours = 4 counted', sm.hours = 4, sm.hours::text);
  perform pg_temp.chk('pending review = 1 booking, ₱300', sm.pending_review = 1 and sm.pending_review_amount = 300,
    sm.pending_review || ' / ' || sm.pending_review_amount);

  select * into sm from public.admin_summary(s, s + 1);
  perform pg_temp.chk('two-day range adds the next day (3 h + paddles = 800)', sm.total_earnings = 1950 and sm.hours = 7, sm.total_earnings::text);
  select * into sm from public.admin_summary(s + 2, s + 5);
  perform pg_temp.chk('empty range → all zeros', sm.total_earnings = 0 and sm.bookings = 0 and sm.pending_review = 0, sm.total_earnings::text);
  r := pg_temp.try(format('select * from public.admin_summary(%L, %L)', s, s - 1));
  perform pg_temp.chk('from after to → invalid_range', r = 'invalid_range', r);

  -- ---------------- settings: updated_by ----------------
  update public.settings set court_name = court_name;
  perform pg_temp.as_admin();
  perform pg_temp.chk('settings remember who changed them', (select updated_by from public.settings) = uo, null);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 70) as detail from _results order by n;

rollback;
