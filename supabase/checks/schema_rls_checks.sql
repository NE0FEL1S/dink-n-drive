-- Schema + RLS checks. Runs in one transaction and ROLLS BACK (leaves no data).
-- Run: npx supabase db query --remote -o table -f supabase/checks/schema_rls_checks.sql

begin;

create temp table _results (n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on _results to anon, authenticated;
grant usage, select on sequence _results_n_seq to anon, authenticated;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  t0 timestamptz := date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + interval '20 days 10 hours'; -- 10:00 Manila, 20 days ahead
  cnt int;
  v text;
begin
  -- users -> profile trigger
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (a, 'e2e+checkA@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Alice Check"}'),
         (b, 'e2e+checkB@dinkndrive.test', 'authenticated', 'authenticated', '{"name":"Bob Google"}');
  select full_name into v from public.profiles where id = a;
  insert into _results(check_name, ok, detail) values ('trigger: profile from email sign-up name', v = 'Alice Check', v);
  select full_name into v from public.profiles where id = b;
  insert into _results(check_name, ok, detail) values ('trigger: profile from Google name', v = 'Bob Google', v);
  select role::text into v from public.profiles where id = a;
  insert into _results(check_name, ok, detail) values ('default role is customer', v = 'customer', v);

  update public.profiles set phone = '+639171234567' where id in (a, b);
  insert into public.posts (user_id, caption) values (a, 'hello court');  -- fixture (as admin)

  -- base booking for A: 10:00-12:00, confirmed
  insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                               hourly_rate, court_fee, paddle_rented, paddle_fee, cancel_fee, total, status)
  values ('DND-AAAA2', a, 'Alice', 'a@x.test', '+639171234567', t0, t0 + interval '2 hours', 2, 250, 500, true, 50, 100, 550, 'confirmed');
  insert into _results(check_name, ok, detail) values ('valid 2h booking inserts', true, null);

  -- overlap rejected
  begin
    insert into public.bookings (ref_code, guest_token_hash, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                                 hourly_rate, court_fee, total, status, hold_expires_at)
    values ('DND-BBBB2', repeat('a', 64), 'Guest', 'g@x.test', '+639171234568', t0 + interval '1 hour', t0 + interval '3 hours', 2, 250, 500, 500, 'pending_payment', now() + interval '15 min');
    insert into _results(check_name, ok, detail) values ('overlapping booking rejected', false, 'inserted!');
  exception when exclusion_violation then
    insert into _results(check_name, ok, detail) values ('overlapping booking rejected', true, sqlerrm);
  end;

  -- adjacent (12:00-13:00) allowed
  insert into public.bookings (ref_code, guest_token_hash, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                               hourly_rate, court_fee, total, status, hold_expires_at)
  values ('DND-CCCC2', repeat('b', 64), 'Guest', 'g@x.test', '+639171234568', t0 + interval '2 hours', t0 + interval '3 hours', 1, 250, 250, 250, 'pending_payment', now() + interval '15 min');
  insert into _results(check_name, ok, detail) values ('adjacent booking allowed', true, null);

  -- overlap with an inactive (expired) booking allowed
  insert into public.bookings (ref_code, guest_token_hash, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                               hourly_rate, court_fee, total, status)
  values ('DND-DDDD2', repeat('c', 64), 'Guest', 'g@x.test', '+639171234568', t0, t0 + interval '1 hour', 1, 250, 250, 250, 'expired');
  insert into _results(check_name, ok, detail) values ('expired booking may overlap', true, null);

  -- block overlapping an active booking rejected
  begin
    insert into public.bookings (ref_code, kind, start_at, end_at, hours, status, block_note)
    values ('DND-EEEE2', 'block', t0 + interval '1 hour', t0 + interval '2 hours', 1, 'blocked', 'maintenance');
    insert into _results(check_name, ok, detail) values ('block over active booking rejected', false, 'inserted!');
  exception when exclusion_violation then
    insert into _results(check_name, ok, detail) values ('block over active booking rejected', true, sqlerrm);
  end;

  -- 9:15 start rejected
  begin
    insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                                 hourly_rate, court_fee, total, status)
    values ('DND-FFFF2', a, 'Alice', 'a@x.test', '+639171234567', t0 + interval '5 hours 15 min', t0 + interval '6 hours 15 min', 1, 250, 250, 250, 'confirmed');
    insert into _results(check_name, ok, detail) values ('9:15 start rejected', false, 'inserted!');
  exception when check_violation then
    insert into _results(check_name, ok, detail) values ('9:15 start rejected', true, sqlerrm);
  end;

  -- hours / end mismatch rejected
  begin
    insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                                 hourly_rate, court_fee, total, status)
    values ('DND-GGGG2', a, 'Alice', 'a@x.test', '+639171234567', t0 + interval '6 hours', t0 + interval '8 hours', 1, 250, 250, 250, 'confirmed');
    insert into _results(check_name, ok, detail) values ('end_at must equal start + hours', false, 'inserted!');
  exception when check_violation then
    insert into _results(check_name, ok, detail) values ('end_at must equal start + hours', true, sqlerrm);
  end;

  -- wrong total rejected
  begin
    insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                                 hourly_rate, court_fee, total, status)
    values ('DND-HHHH2', a, 'Alice', 'a@x.test', '+639171234567', t0 + interval '6 hours', t0 + interval '7 hours', 1, 250, 250, 100, 'confirmed');
    insert into _results(check_name, ok, detail) values ('total must add up', false, 'inserted!');
  exception when check_violation then
    insert into _results(check_name, ok, detail) values ('total must add up', true, sqlerrm);
  end;

  -- customer booking with both user and guest token rejected
  begin
    insert into public.bookings (ref_code, user_id, guest_token_hash, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                                 hourly_rate, court_fee, total, status)
    values ('DND-JJJJ2', a, repeat('d', 64), 'Alice', 'a@x.test', '+639171234567', t0 + interval '6 hours', t0 + interval '7 hours', 1, 250, 250, 250, 'confirmed');
    insert into _results(check_name, ok, detail) values ('exactly one of user / guest', false, 'inserted!');
  exception when check_violation then
    insert into _results(check_name, ok, detail) values ('exactly one of user / guest', true, sqlerrm);
  end;

  -- bad ref code rejected (contains O)
  begin
    insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                                 hourly_rate, court_fee, total, status)
    values ('DND-OOOO2', a, 'Alice', 'a@x.test', '+639171234567', t0 + interval '6 hours', t0 + interval '7 hours', 1, 250, 250, 250, 'confirmed');
    insert into _results(check_name, ok, detail) values ('ref code alphabet (no O/0/I/1)', false, 'inserted!');
  exception when check_violation then
    insert into _results(check_name, ok, detail) values ('ref code alphabet (no O/0/I/1)', true, sqlerrm);
  end;

  -- bad phone rejected on profile
  begin
    update public.profiles set phone = '09171234567' where id = a;
    insert into _results(check_name, ok, detail) values ('phone stored as +639XXXXXXXXX only', false, 'updated!');
  exception when check_violation then
    insert into _results(check_name, ok, detail) values ('phone stored as +639XXXXXXXXX only', true, sqlerrm);
  end;

  -- B's own booking (so A must not see it)
  insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                               hourly_rate, court_fee, total, status)
  values ('DND-KKKK2', b, 'Bob', 'b@x.test', '+639171234567', t0 + interval '8 hours', t0 + interval '9 hours', 1, 250, 250, 250, 'confirmed');

  -- ======================= as customer A =======================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into cnt from public.bookings;
  insert into _results(check_name, ok, detail) values ('RLS: customer sees only own bookings', cnt = 1, cnt::text);

  select count(*) into cnt from public.profiles;
  insert into _results(check_name, ok, detail) values ('RLS: customer sees only own profile', cnt = 1, cnt::text);

  begin
    update public.profiles set role = 'owner' where id = a;
    insert into _results(check_name, ok, detail) values ('customer cannot change own role', false, 'updated!');
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('customer cannot change own role', true, sqlerrm);
  end;

  update public.profiles set full_name = 'Alice Renamed' where id = a;
  get diagnostics cnt = row_count;
  insert into _results(check_name, ok, detail) values ('customer can edit own name', cnt = 1, cnt::text);

  update public.profiles set full_name = 'Hacked' where id = b;
  get diagnostics cnt = row_count;
  insert into _results(check_name, ok, detail) values ('customer cannot edit others', cnt = 0, cnt::text);

  begin
    insert into public.bookings (ref_code, user_id, contact_name, contact_email, contact_phone, start_at, end_at, hours,
                                 hourly_rate, court_fee, total, status)
    values ('DND-LLLL2', a, 'Alice', 'a@x.test', '+639171234567', t0 + interval '10 hours', t0 + interval '11 hours', 1, 0, 0, 0, 'confirmed');
    insert into _results(check_name, ok, detail) values ('customer cannot insert bookings directly', false, 'inserted!');
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('customer cannot insert bookings directly', true, sqlerrm);
  end;

  update public.bookings set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now() where user_id = a;
  get diagnostics cnt = row_count;
  insert into _results(check_name, ok, detail) values ('customer cannot update bookings directly', cnt = 0, cnt::text);

  update public.settings set hourly_rate = 1;
  get diagnostics cnt = row_count;
  insert into _results(check_name, ok, detail) values ('customer cannot change settings', cnt = 0, cnt::text);

  begin
    insert into public.posts (user_id, caption) values (b, 'impersonation');
    insert into _results(check_name, ok, detail) values ('cannot post as someone else', false, 'inserted!');
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('cannot post as someone else', true, sqlerrm);
  end;

  -- Phase 5: posts are created only through create_post (see community_checks.sql)
  begin
    insert into public.posts (user_id, caption) values (a, 'hello court');
    insert into _results(check_name, ok, detail) values ('direct post insert refused (use create_post)', false, 'inserted!');
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('direct post insert refused (use create_post)', true, sqlerrm);
  end;

  -- ======================= as anon (guest) =======================
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';

  begin
    select count(*) into cnt from public.bookings;
    insert into _results(check_name, ok, detail) values ('anon cannot read bookings', false, cnt::text);
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('anon cannot read bookings', true, sqlerrm);
  end;

  begin
    select count(*) into cnt from public.profiles;
    insert into _results(check_name, ok, detail) values ('anon cannot read profiles', false, cnt::text);
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('anon cannot read profiles', true, sqlerrm);
  end;

  begin
    select count(*) into cnt from public.feedback;
    insert into _results(check_name, ok, detail) values ('anon cannot read raw feedback', false, cnt::text);
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('anon cannot read raw feedback', true, sqlerrm);
  end;

  select count(*) into cnt from public.settings;
  insert into _results(check_name, ok, detail) values ('anon can read settings', cnt = 1, cnt::text);

  select count(*) into cnt from public.posts where user_id = a;
  insert into _results(check_name, ok, detail) values ('anon can read live posts', cnt = 1, cnt::text);

  begin
    insert into public.posts (user_id, caption) values (a, 'anon post');
    insert into _results(check_name, ok, detail) values ('anon cannot post', false, 'inserted!');
  exception when insufficient_privilege then
    insert into _results(check_name, ok, detail) values ('anon cannot post', true, sqlerrm);
  end;

  -- ======================= owner =======================
  execute 'reset role';
  update public.profiles set role = 'owner' where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into cnt from public.bookings;
  insert into _results(check_name, ok, detail) values ('owner sees all bookings', cnt >= 4, cnt::text);

  update public.settings set hourly_rate = hourly_rate;
  get diagnostics cnt = row_count;
  insert into _results(check_name, ok, detail) values ('owner can update settings', cnt = 1, cnt::text);

  execute 'reset role';
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 90) as detail from _results order by n;

rollback;
