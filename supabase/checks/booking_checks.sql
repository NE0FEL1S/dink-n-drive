-- Booking function checks (Phase 2). Runs in one transaction and ROLLS BACK (leaves no data).
-- Run after the migration is applied:
--   npx supabase db query --remote -o table -f supabase/checks/booking_checks.sql
-- Settings are pinned inside the transaction (₱250/h, ₱50 paddles, 15-min hold, 8 AM–midnight,
-- 30 days ahead, 2 unpaid per phone, ₱100 fee) so the expectations below don't depend on live values.

begin;

create temp table _results (n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on _results to anon, authenticated;
grant usage, select on sequence _results_n_seq to anon, authenticated;

-- record a result
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into _results (check_name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;

-- run SQL, return 'OK' or the error message
create function pg_temp.try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlerrm;
end $$;

-- act as anon (optionally nobody), or as a signed-in user
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

update public.settings
   set hourly_rate = 250, paddle_fee = 50, hold_minutes = 15, open_hour = 8, close_hour = 24,
       max_advance_days = 30, max_unpaid_bookings = 2, cancel_fee = 100;

do $$
declare
  ua uuid := gen_random_uuid();   -- signed-in customer with a complete profile
  ub uuid := gen_random_uuid();   -- signed-in customer without a phone yet
  t1 text := 'e2eCheckTokenOneAAAAAAAAAAAAAAAAAAAAAAAAAA1';
  t2 text := 'e2eCheckTokenTwoBBBBBBBBBBBBBBBBBBBBBBBBBB2';
  today date := (now() at time zone 'Asia/Manila')::date;
  d date := today + 20;  -- far ahead, away from demo bookings
  ph1 text := '+639990000001';
  ph2 text := '+639990000002';
  r text;
  cnt int;
  v_id uuid; v_id2 uuid; v_ref text; v_total int; v_hold timestamptz;
  b public.bookings;
begin
  -- helper: Manila wall-clock time on day d at hour h
  -- (inline: ((d + make_interval(hours => h))::timestamp at time zone 'Asia/Manila'))

  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (ua, 'e2e+chk-a@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Alice Check"}'),
         (ub, 'e2e+chk-b@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Bob Check"}');
  update public.profiles set phone = '+639990000009' where id = ua;

  -- ---------------- guest booking ----------------
  perform pg_temp.as_anon();
  select booking_id, ref_code, total, hold_expires_at into v_id, v_ref, v_total, v_hold
  from public.create_booking(((d + 10 * interval '1 hour')::timestamp at time zone 'Asia/Manila'), 2, true, ' Guest One ', 'Guest@Example.COM', ph1, t1);
  perform pg_temp.chk('guest books 10-12 with paddles', v_id is not null, v_ref);
  perform pg_temp.chk('ref code format DND-XXXXX', v_ref ~ '^DND-[2-9A-HJ-NP-Z]{5}$', v_ref);
  perform pg_temp.chk('total = 2 x 250 + 50', v_total = 550, v_total::text);
  perform pg_temp.chk('hold is 15 minutes', v_hold between now() + interval '14 min 59 s' and now() + interval '15 min 1 s', v_hold::text);

  perform pg_temp.as_admin();
  select * into b from public.bookings where id = v_id;
  perform pg_temp.chk('stored: guest hash = sha256(token)', b.guest_token_hash = encode(sha256(convert_to(t1, 'UTF8')), 'hex') and b.user_id is null, null);
  perform pg_temp.chk('stored: contact trimmed / email lowercased', b.contact_name = 'Guest One' and b.contact_email = 'guest@example.com', b.contact_name || ' ' || b.contact_email);
  perform pg_temp.chk('stored: rates + cancel fee copied', b.hourly_rate = 250 and b.court_fee = 500 and b.paddle_fee = 50 and b.cancel_fee = 100 and b.status = 'pending_payment', null);

  -- ---------------- availability ----------------
  perform pg_temp.as_anon();
  select count(*) into cnt from public.get_availability(d)
   where start_at = ((d + 10 * interval '1 hour')::timestamp at time zone 'Asia/Manila');
  perform pg_temp.chk('availability shows the held 10-12', cnt = 1, cnt::text);
  perform pg_temp.chk('availability returns only start_at/end_at',
    (select array_to_string(proargnames, ',') from pg_catalog.pg_proc where proname = 'get_availability') = 'p_day,start_at,end_at', null);

  -- ---------------- rules ----------------
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 11 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('overlap → slot_taken', r = 'slot_taken', r);

  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 12 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest One', 'g1@example.com', ph1, t1));
  perform pg_temp.chk('adjacent 12-13 allowed (2nd unpaid for phone)', r = 'OK', r);

  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 14 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest One', 'g1@example.com', ph1, t2));
  perform pg_temp.chk('3rd unpaid for the same phone → unpaid_limit', r = 'unpaid_limit', r);

  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, null)',
        (d + 15 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'No Token', 'n@example.com', ph2));
  perform pg_temp.chk('guest without token → invalid_token', r = 'invalid_token', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 15 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Bad Token', 'n@example.com', ph2, 'short'));
  perform pg_temp.chk('malformed token → invalid_token', r = 'invalid_token', r);

  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 15 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', '09990000002', t2));
  perform pg_temp.chk('phone not +639… → invalid_phone', r = 'invalid_phone', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 15 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'not-an-email', ph2, t2));
  perform pg_temp.chk('bad email → invalid_email', r = 'invalid_email', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 15 * interval '1 hour')::timestamp at time zone 'Asia/Manila', '   ', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('blank name → invalid_name', r = 'invalid_name', r);

  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        ((today - 1) + 10 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('yesterday → in_the_past', r = 'in_the_past', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + interval '9 hours 30 minutes')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('9:30 → not_on_the_hour', r = 'not_on_the_hour', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 0, false, %L, %L, %L, %L)',
        (d + 15 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('0 hours → invalid_hours', r = 'invalid_hours', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 7 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('7 AM (before opening) → outside_opening_hours', r = 'outside_opening_hours', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 2, false, %L, %L, %L, %L)',
        (d + 23 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('11 PM for 2h (past midnight) → outside_opening_hours', r = 'outside_opening_hours', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 23 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', ph2, t2));
  perform pg_temp.chk('11 PM–midnight allowed', r = 'OK', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        ((today + 31) + 10 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', '+639990000003', t2));
  perform pg_temp.chk('31 days ahead → too_far_ahead', r = 'too_far_ahead', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        ((today + 30) + 10 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Guest Two', 'g2@example.com', '+639990000003', t2));
  perform pg_temp.chk('30 days ahead allowed', r = 'OK', r);

  -- ---------------- signed-in bookings ----------------
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false)',
        (d + 16 * interval '1 hour')::timestamp at time zone 'Asia/Manila'));
  perform pg_temp.chk('signed in, no phone anywhere → invalid_phone', r = 'invalid_phone', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L)',
        (d + 16 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Someone Else', 'other@example.com', '+639990000004'));
  perform pg_temp.chk('signed in, phone given → booked', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where user_id = ub;
  perform pg_temp.chk('signed-in snapshot uses profile name + account email', b.contact_name = 'Bob Check' and b.contact_email = 'e2e+chk-b@dinkndrive.test' and b.guest_token_hash is null, b.contact_name || ' ' || b.contact_email);
  perform pg_temp.chk('missing phone saved to profile', (select phone from public.profiles where id = ub) = '+639990000004', null);

  perform pg_temp.as_user(ua);
  select booking_id into v_id2 from public.create_booking(((d + 17 * interval '1 hour')::timestamp at time zone 'Asia/Manila'), 1, false, 'Ignored', 'ignored@example.com', '+639990000005', t1);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = v_id2;
  perform pg_temp.chk('signed in: profile phone wins, token ignored', b.contact_phone = '+639990000009' and b.user_id = ua and b.guest_token_hash is null, b.contact_phone);

  -- ---------------- direct table access is closed ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try('select count(*) from public.bookings');
  perform pg_temp.chk('anon cannot read bookings table', r like 'permission denied%', r);
  r := pg_temp.try('select private.expire_overdue_holds()');
  perform pg_temp.chk('anon cannot call private functions', r like 'permission denied%', r);
  r := pg_temp.try(format('select public.claim_guest_bookings(%L)', t1));
  perform pg_temp.chk('anon cannot call claim_guest_bookings', r like 'permission denied%', r);
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format($q$insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours, status, hold_expires_at)
                          values ('DND-ZZZZ9', %L, 'x', 'x@x.test', '+639990000004', %L, %L, 1, 'pending_payment', now() + interval '1 hour')$q$,
                          ub, (d + 20 * interval '1 hour')::timestamp at time zone 'Asia/Manila', (d + 21 * interval '1 hour')::timestamp at time zone 'Asia/Manila'));
  perform pg_temp.chk('customer cannot insert bookings directly', r like '%row-level security%', r);

  -- ---------------- my_bookings ----------------
  perform pg_temp.as_anon();
  select count(*) into cnt from public.my_bookings(t1);
  perform pg_temp.chk('guest t1 sees its 2 bookings', cnt = 2, cnt::text);
  select count(*) into cnt from public.my_bookings(null);
  perform pg_temp.chk('anon without token sees nothing', cnt = 0, cnt::text);
  perform pg_temp.as_user(ua);
  select count(*) into cnt from public.my_bookings(null);
  perform pg_temp.chk('user A sees own booking only', cnt = 1, cnt::text);
  select count(*) into cnt from public.my_bookings(t1);
  perform pg_temp.chk('user A + this browser token sees 3', cnt = 3, cnt::text);

  -- ---------------- payment proof ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.check_payment_upload(%L, %L)', v_id, t2));
  perform pg_temp.chk('upload check with another token → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.check_payment_upload(%L, null)', v_id));
  perform pg_temp.chk('upload check without token → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.check_payment_upload(%L, %L)', v_id, t1));
  perform pg_temp.chk('upload check by owner token → ok', r = 'OK', r);

  perform pg_temp.as_admin();
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_id::text || '/proof-check.webp');
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.submit_payment_proof(%L, %L, %L)', v_id, 'someone-else/proof.webp', t1));
  perform pg_temp.chk('proof path outside the booking folder → invalid_path', r = 'invalid_path', r);
  r := pg_temp.try(format('select public.submit_payment_proof(%L, %L, %L)', v_id, v_id::text || '/missing.webp', t1));
  perform pg_temp.chk('proof not in storage → proof_missing', r = 'proof_missing', r);
  r := pg_temp.try(format('select public.submit_payment_proof(%L, %L, %L)', v_id, v_id::text || '/proof-check.webp', t2));
  perform pg_temp.chk('proof by another token → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.submit_payment_proof(%L, %L, %L)', v_id, v_id::text || '/proof-check.webp', t1));
  perform pg_temp.chk('proof by owner → ok', r = 'OK', r);
  perform pg_temp.as_admin();
  select * into b from public.bookings where id = v_id;
  perform pg_temp.chk('booking now pending_review with proof path', b.status = 'pending_review' and b.payment_proof_path = v_id::text || '/proof-check.webp' and b.payment_submitted_at is not null, b.status::text);
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.submit_payment_proof(%L, %L, %L)', v_id, v_id::text || '/proof-check.webp', t1));
  perform pg_temp.chk('second proof → not_awaiting_payment', r = 'not_awaiting_payment', r);
  r := pg_temp.try(format('select public.cancel_unpaid_booking(%L, %L)', v_id, t1));
  perform pg_temp.chk('paid booking cannot use free cancel', r = 'not_awaiting_payment', r);

  -- ---------------- cancel unpaid ----------------
  select id into v_id2 from public.my_bookings(t1) where status = 'pending_payment' limit 1;
  r := pg_temp.try(format('select public.cancel_unpaid_booking(%L, %L)', v_id2, t2));
  perform pg_temp.chk('cancel with another token → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.cancel_unpaid_booking(%L, %L)', v_id2, t1));
  perform pg_temp.chk('cancel unpaid by owner → ok', r = 'OK', r);
  select count(*) into cnt from public.get_availability(d)
   where start_at = ((d + 12 * interval '1 hour')::timestamp at time zone 'Asia/Manila');
  perform pg_temp.chk('cancelled hour is free again', cnt = 0, cnt::text);
  r := pg_temp.try(format('select public.cancel_unpaid_booking(%L, %L)', v_id2, t1));
  perform pg_temp.chk('cancel twice → not_awaiting_payment', r = 'not_awaiting_payment', r);

  -- ---------------- holds and expiry ----------------
  perform pg_temp.as_anon();
  select booking_id into v_id2 from public.create_booking(((d + 18 * interval '1 hour')::timestamp at time zone 'Asia/Manila'), 1, false, 'Late Payer', 'late@example.com', '+639990000006', t2);
  perform pg_temp.as_admin();
  update public.bookings set hold_expires_at = now() - interval '1 minute' where id = v_id2;
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_id2::text || '/late.webp');
  perform pg_temp.as_anon();
  select count(*) into cnt from public.get_availability(d)
   where start_at = ((d + 18 * interval '1 hour')::timestamp at time zone 'Asia/Manila');
  perform pg_temp.chk('overdue hold shows as free before cron runs', cnt = 0, cnt::text);
  r := pg_temp.try(format('select public.check_payment_upload(%L, %L)', v_id2, t2));
  perform pg_temp.chk('no new upload URL after the deadline', r = 'hold_expired', r);
  r := pg_temp.try(format('select public.submit_payment_proof(%L, %L, %L)', v_id2, v_id2::text || '/late.webp', t2));
  perform pg_temp.chk('proof 1 min late, hours still held → accepted (grace)', r = 'OK', r);

  select booking_id into v_id2 from public.create_booking(((d + 19 * interval '1 hour')::timestamp at time zone 'Asia/Manila'), 1, false, 'Too Late', 'toolate@example.com', '+639990000007', t2);
  perform pg_temp.as_admin();
  update public.bookings set hold_expires_at = now() - interval '5 minutes' where id = v_id2;
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_id2::text || '/late.webp');
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.submit_payment_proof(%L, %L, %L)', v_id2, v_id2::text || '/late.webp', t2));
  perform pg_temp.chk('proof 5 min late → hold_expired', r = 'hold_expired', r);
  select status::text into r from public.my_bookings(t2) where id = v_id2;
  perform pg_temp.chk('my_bookings shows an overdue hold as expired', r = 'expired', r);
  r := pg_temp.try(format('select * from public.create_booking(%L, 1, false, %L, %L, %L, %L)',
        (d + 19 * interval '1 hour')::timestamp at time zone 'Asia/Manila', 'Next Person', 'next@example.com', '+639990000008', t1));
  perform pg_temp.chk('someone else can book an overdue hold (expired first)', r = 'OK', r);
  perform pg_temp.as_admin();
  perform pg_temp.chk('overdue hold was expired by create_booking', (select status from public.bookings where id = v_id2) = 'expired', null);

  -- ---------------- claim guest bookings ----------------
  perform pg_temp.as_user(ub);
  select public.claim_guest_bookings(t2) into cnt;
  perform pg_temp.chk('sign-in claims this browser''s guest bookings', cnt >= 3, cnt::text);
  perform pg_temp.as_anon();
  select count(*) into cnt from public.my_bookings(t2);
  perform pg_temp.chk('claimed bookings no longer listed for the bare token', cnt = 0, cnt::text);
  perform pg_temp.as_admin();
  select count(*) into cnt from public.bookings where user_id = ub and guest_token_hash is null;
  perform pg_temp.chk('claimed bookings belong to the account', cnt >= 4, cnt::text);

  -- ---------------- cron ----------------
  perform pg_temp.chk('cron job scheduled every minute',
    exists (select 1 from cron.job where jobname = 'expire-unpaid-holds' and schedule = '* * * * *' and active), null);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 70) as detail from _results order by n;

rollback;
