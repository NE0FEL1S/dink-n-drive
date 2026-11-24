-- Customers + earnings chart checks (Phase 7). Runs in one transaction and ROLLS BACK (leaves no data).
-- Run after the migration is applied:
--   npx supabase db query --remote -o table -f supabase/checks/customer_checks.sql
-- Fixture phones all start with +639990007 so the searches only see them. Past bookings sit
-- ~400 days back and future ones ~330 days ahead, away from live bookings.

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

-- fixture customer booking inserted directly (as admin): an account's when p_user is set, else a guest's
create function pg_temp.mk(p_phone text, p_user uuid, p_name text, d date, h int, n int, paddles boolean,
                           st public.booking_status) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into public.bookings (
    ref_code, kind, user_id, guest_token_hash, contact_name, contact_email, contact_phone,
    start_at, end_at, hours, paddle_rented, hourly_rate, court_fee, paddle_fee, cancel_fee, total,
    status, hold_expires_at, status_before_request, cancelled_by, cancelled_at
  ) values (
    private.random_ref_code(), 'customer', p_user, case when p_user is null then repeat('d', 64) end,
    p_name, 'chk-guest@example.com', p_phone,
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

do $$
declare
  uo uuid := gen_random_uuid();   -- owner (has a fixture phone, never listed as an account)
  ua uuid := gen_random_uuid();   -- account + guest bookings on the same phone
  ub uuid := gen_random_uuid();   -- account without phone or bookings
  uc uuid := gen_random_uuid();   -- account without an email login, booked with an old phone
  today date := (now() at time zone 'Asia/Manila')::date;
  p date := today - 400;          -- past play dates
  f date := today + 320;          -- future play dates
  s date := today + 330;          -- daily earnings checks
  r text;
  cnt int;
  v_id uuid;
  c record;
  e record;
  sm record;
  v_names text;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (uo, 'e2e+chk-cs-owner@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Owner Cs"}'),
         (ua, 'e2e+chk-cs-ana@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Ana Chk"}'),
         (ub, 'e2e+chk-cs-nophone@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Bea Chk"}'),
         (uc, 'e2e+chk-cs-nologin@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Cy Chk"}');
  insert into auth.identities (user_id, provider, provider_id, identity_data)
  values (uo, 'email', uo::text, json_build_object('sub', uo::text)::jsonb),
         (ua, 'email', ua::text, json_build_object('sub', ua::text)::jsonb),
         (ub, 'email', ub::text, json_build_object('sub', ub::text)::jsonb);
  update public.profiles set role = 'owner', phone = '+639990007009' where id = uo;
  update public.profiles set phone = '+639990007001' where id = ua;
  update public.profiles set phone = '+639990007003' where id = uc;

  -- group +639990007001: Ana's account + a guest booking on her phone
  perform pg_temp.mk('+639990007001', ua, 'Ana Chk', p, 10, 2, true, 'confirmed');        -- 550, 2 h
  perform pg_temp.mk('+639990007001', null, 'Ana Guest', p + 1, 10, 1, false, 'confirmed'); -- 250, 1 h, guest
  perform pg_temp.mk('+639990007001', null, 'Ana Guest', p, 14, 1, false, 'expired');      -- ignored
  v_id := pg_temp.mk('+639990007001', ua, 'Ana Chk', p, 16, 1, false, 'cancelled');        -- fee 100 kept
  insert into public.refunds (booking_id, cancel_fee, refund_amount, status, completed_at)
  values (v_id, 100, 150, 'completed', now());
  perform pg_temp.mk('+639990007001', ua, 'Ana Chk', f, 10, 1, false, 'pending_review');   -- not counted
  perform pg_temp.mk('+639990007001', ua, 'Ana Chk', f, 12, 1, false, 'confirmed');        -- 250, 1 h, next visit
  -- Cy booked under an old phone before changing it
  perform pg_temp.mk('+639990007004', uc, 'Cy Chk', p, 18, 1, false, 'confirmed');
  -- guest-only phones
  perform pg_temp.mk('+639990007005', null, 'Expired Only', p, 20, 1, false, 'expired');   -- not listed
  perform pg_temp.mk('+639990007006', null, 'Guest Only Chk', p, 8, 1, false, 'confirmed');

  -- ---------------- who may call ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try('select * from public.admin_customers()');
  perform pg_temp.chk('anon cannot list customers', r like 'permission denied%', r);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', ua, '+639990007001'));
  perform pg_temp.chk('anon cannot check a reset', r like 'permission denied%', r);
  r := pg_temp.try(format('select * from public.admin_daily_earnings(%L, %L)', s, s));
  perform pg_temp.chk('anon cannot read daily earnings', r like 'permission denied%', r);

  perform pg_temp.as_user(ua);
  r := pg_temp.try('select * from public.admin_customers()');
  perform pg_temp.chk('customer list → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', ua, '+639990007001'));
  perform pg_temp.chk('customer reset check → not_owner', r = 'not_owner', r);
  r := pg_temp.try(format('select * from public.admin_daily_earnings(%L, %L)', s, s));
  perform pg_temp.chk('customer daily earnings → not_owner', r = 'not_owner', r);

  -- ---------------- customers list ----------------
  perform pg_temp.as_user(uo);
  select count(*), max(total_count) into cnt, r from public.admin_customers('09990007');
  perform pg_temp.chk('phone search "09990007" → 4 groups (001, 003, 004, 006)', cnt = 4 and r = '4', cnt || ' / ' || r);
  select string_agg(phone, ',' order by phone) into v_names from public.admin_customers('09990007');
  perform pg_temp.chk('expired-only guest and owner are not listed', v_names = '+639990007001,+639990007003,+639990007004,+639990007006', v_names);

  select * into c from public.admin_customers('+63 999 000 7001');
  perform pg_temp.chk('Ana: one group with account + guest bookings', c.phone = '+639990007001' and jsonb_array_length(c.accounts) = 1, c.accounts::text);
  perform pg_temp.chk('Ana: name and email come from the account', c.name = 'Ana Chk' and c.email = 'e2e+chk-cs-ana@dinkndrive.test', c.name || ' ' || c.email);
  perform pg_temp.chk('Ana: 3 counted bookings, 1 as guest', c.bookings = 3 and c.guest_bookings = 1, c.bookings || ' / ' || c.guest_bookings);
  perform pg_temp.chk('Ana: 4 hours', c.hours = 4, c.hours::text);
  perform pg_temp.chk('Ana: spent 550 + 250 + 250 + 100 kept fee', c.total_spent = 1150, c.total_spent::text);
  perform pg_temp.chk('Ana: last visit = latest past counted booking', c.last_visit = pg_temp.at(p + 1, 10), c.last_visit::text);
  perform pg_temp.chk('Ana: next visit = upcoming confirmed (not pending review)', c.next_visit = pg_temp.at(f, 12), c.next_visit::text);
  perform pg_temp.chk('Ana: account can be reset', (c.accounts -> 0 ->> 'can_reset')::boolean and (c.accounts -> 0 ->> 'id')::uuid = ua, c.accounts::text);

  select * into c from public.admin_customers('+639990007003');
  perform pg_temp.chk('Cy (no email login): can_reset false', not (c.accounts -> 0 ->> 'can_reset')::boolean, c.accounts::text);
  perform pg_temp.chk('Cy profile phone with no bookings there: 0 bookings', c.bookings = 0 and c.total_spent = 0, c.bookings::text);
  select * into c from public.admin_customers('09990007004');
  perform pg_temp.chk('Cy also linked to the old phone he booked with', (c.accounts -> 0 ->> 'id')::uuid = uc and c.bookings = 1, c.accounts::text);

  select * into c from public.admin_customers('GUEST ONLY chk');
  perform pg_temp.chk('name search is case-insensitive; guest name from booking', c.name = 'Guest Only Chk' and c.accounts = '[]'::jsonb, c.name);
  perform pg_temp.chk('guest-only: all bookings are guest bookings', c.bookings = 1 and c.guest_bookings = 1 and c.total_spent = 250, c.bookings::text);

  select count(*) into cnt from public.admin_customers('e2e+chk-cs-nophone');
  select * into c from public.admin_customers('e2e+chk-cs-nophone');
  perform pg_temp.chk('account without phone or bookings is listed (phone null)', cnt = 1 and c.phone is null and c.name = 'Bea Chk', cnt::text);
  select count(*) into cnt from public.admin_customers('e2e+chk-cs-owner');
  perform pg_temp.chk('owner account is never listed', cnt = 0, cnt::text);
  select count(*) into cnt from public.admin_customers('zz%_');
  perform pg_temp.chk('% and _ are matched literally', cnt = 0, cnt::text);

  select string_agg(phone, ',' order by n) into v_names
  from (select phone, row_number() over () as n from public.admin_customers('09990007', 'spent')) x;
  perform pg_temp.chk('sort spent: Ana first, Cy (₱0) last', v_names like '+639990007001,%,+639990007003', v_names);
  select string_agg(name, ',' order by n) into v_names
  from (select name, row_number() over () as n from public.admin_customers('09990007', 'name')) x;
  perform pg_temp.chk('sort name: A → G', v_names = 'Ana Chk,Cy Chk,Cy Chk,Guest Only Chk', v_names);
  select string_agg(phone, ',' order by n) into v_names
  from (select phone, row_number() over () as n from public.admin_customers('09990007', 'bookings')) x;
  perform pg_temp.chk('sort bookings: Ana (3) first', v_names like '+639990007001,%', v_names);
  select string_agg(phone, ',' order by n) into v_names
  from (select phone, row_number() over () as n from public.admin_customers('09990007')) x;
  perform pg_temp.chk('sort recent: upcoming/latest visit first', v_names like '+639990007001,%', v_names);

  select count(*), max(total_count) into cnt, r from public.admin_customers('09990007', 'name', 1, 1);
  perform pg_temp.chk('limit 1 offset 1 → 1 row, total still 4', cnt = 1 and r = '4', cnt || ' / ' || r);
  select count(*) into cnt from public.admin_customers('09990007', 'name', 20, 10);
  perform pg_temp.chk('offset past the end → no rows', cnt = 0, cnt::text);

  r := pg_temp.try('select * from public.admin_customers(null, ''cheapest'')');
  perform pg_temp.chk('unknown sort → invalid_sort', r = 'invalid_sort', r);
  r := pg_temp.try('select * from public.admin_customers(null, ''recent'', 0)');
  perform pg_temp.chk('limit 0 → invalid_page', r = 'invalid_page', r);
  r := pg_temp.try('select * from public.admin_customers(null, ''recent'', 101)');
  perform pg_temp.chk('limit 101 → invalid_page', r = 'invalid_page', r);
  r := pg_temp.try('select * from public.admin_customers(null, ''recent'', 20, -1)');
  perform pg_temp.chk('negative offset → invalid_page', r = 'invalid_page', r);
  r := pg_temp.try(format('select * from public.admin_customers(%L)', repeat('a', 101)));
  perform pg_temp.chk('101-char search → invalid_search', r = 'invalid_search', r);
  r := pg_temp.try('select * from public.admin_customers(''  '', null)');
  perform pg_temp.chk('blank search + null sort → everyone, recent', r = 'OK', r);

  -- ---------------- password reset check ----------------
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', ua, '+639990007001'));
  perform pg_temp.chk('matching phone → OK', r = 'OK', r);
  perform pg_temp.chk('returns the login email',
    public.admin_password_reset_target(ua, '+639990007001') = 'e2e+chk-cs-ana@dinkndrive.test', null);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', ua, '+639990007002'));
  perform pg_temp.chk('wrong phone → phone_mismatch', r = 'phone_mismatch', r);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, null)', ua));
  perform pg_temp.chk('no phone given → phone_mismatch', r = 'phone_mismatch', r);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', ub, '+639990007001'));
  perform pg_temp.chk('account without phone → no_phone_on_file', r = 'no_phone_on_file', r);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', uc, '+639990007003'));
  perform pg_temp.chk('account without email login → not_resettable', r = 'not_resettable', r);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', uo, '+639990007009'));
  perform pg_temp.chk('owner account → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.admin_password_reset_target(%L, %L)', gen_random_uuid(), '+639990007001'));
  perform pg_temp.chk('unknown account → not_found', r = 'not_found', r);

  -- ---------------- daily earnings ----------------
  perform pg_temp.as_admin();
  perform pg_temp.mk('+639990007011', null, 'Day Chk', s, 8, 2, true, 'confirmed');         -- 550
  perform pg_temp.mk('+639990007011', null, 'Day Chk', s, 11, 1, false, 'cancel_requested'); -- 250 (was confirmed)
  perform pg_temp.mk('+639990007011', null, 'Day Chk', s, 12, 1, true, 'pending_review');    -- 0
  perform pg_temp.mk('+639990007011', null, 'Day Chk', s, 13, 1, false, 'rejected');         -- 0
  v_id := pg_temp.mk('+639990007011', null, 'Day Chk', s + 1, 8, 1, false, 'cancelled');     -- fee 100 kept
  insert into public.refunds (booking_id, cancel_fee, refund_amount, status, completed_at)
  values (v_id, 100, 150, 'completed', now());
  v_id := pg_temp.mk('+639990007011', null, 'Day Chk', s + 1, 9, 1, false, 'cancelled');     -- owner cancel: 0
  update public.bookings set cancelled_by = 'owner' where id = v_id;
  insert into public.refunds (booking_id, cancel_fee, refund_amount, status, completed_at)
  values (v_id, 0, 250, 'completed', now());
  v_id := pg_temp.mk('+639990007011', null, 'Day Chk', s + 1, 10, 1, false, 'cancelled');    -- refund approved only: 0
  insert into public.refunds (booking_id, cancel_fee, refund_amount, gcash_name, gcash_number, status, decided_at)
  values (v_id, 100, 150, 'Day Chk', '+639990007011', 'approved', now());
  insert into public.bookings (ref_code, kind, start_at, end_at, hours, status)
  values (private.random_ref_code(), 'block', pg_temp.at(s + 2, 20), pg_temp.at(s + 2, 22), 2, 'blocked');
  perform pg_temp.mk('+639990007011', null, 'Day Chk', s + 2, 23, 1, false, 'confirmed');    -- 11 PM: still day s+2

  perform pg_temp.as_user(uo);
  select count(*) into cnt from public.admin_daily_earnings(s, s + 3);
  perform pg_temp.chk('one row per day, empty days included', cnt = 4, cnt::text);
  select * into e from public.admin_daily_earnings(s, s + 3) where day = s;
  perform pg_temp.chk('day 1: 550 + 250 (cancel_requested counts)', e.earnings = 800 and e.court_revenue = 750 and e.paddle_revenue = 50, e.earnings::text);
  perform pg_temp.chk('day 1: 2 bookings, 3 hours', e.bookings = 2 and e.hours = 3, e.bookings || ' / ' || e.hours);
  select * into e from public.admin_daily_earnings(s, s + 3) where day = s + 1;
  perform pg_temp.chk('day 2: only the completed customer-cancel fee', e.earnings = 100 and e.cancel_fees = 100 and e.bookings = 0, e.earnings::text);
  select * into e from public.admin_daily_earnings(s, s + 3) where day = s + 2;
  perform pg_temp.chk('day 3: 11 PM booking stays on its Manila play date', e.earnings = 250 and e.bookings = 1, e.earnings::text);
  select * into e from public.admin_daily_earnings(s, s + 3) where day = s + 3;
  perform pg_temp.chk('day 4: zero row', e.earnings = 0 and e.bookings = 0 and e.hours = 0, e.earnings::text);
  select * into sm from public.admin_summary(s, s + 3);
  select sum(earnings)::int into cnt from public.admin_daily_earnings(s, s + 3);
  perform pg_temp.chk('days add up to admin_summary total', cnt = sm.total_earnings and cnt = 1150, cnt || ' vs ' || sm.total_earnings);

  select count(*) into cnt from public.admin_daily_earnings(s, s + 365);
  perform pg_temp.chk('366-day range allowed', cnt = 366, cnt::text);
  r := pg_temp.try(format('select * from public.admin_daily_earnings(%L, %L)', s, s + 366));
  perform pg_temp.chk('367-day range → invalid_range', r = 'invalid_range', r);
  r := pg_temp.try(format('select * from public.admin_daily_earnings(%L, %L)', s, s - 1));
  perform pg_temp.chk('from after to → invalid_range', r = 'invalid_range', r);
  r := pg_temp.try(format('select * from public.admin_daily_earnings(null, %L)', s));
  perform pg_temp.chk('null from → invalid_range', r = 'invalid_range', r);

  perform pg_temp.as_admin();
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 70) as detail from _results order by n;

rollback;
