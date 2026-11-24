-- Feedback checks (Phase 6). Runs in one transaction and ROLLS BACK (leaves no data).
-- Run after the migration is applied:
--   npx supabase db query --remote -o table -f supabase/checks/feedback_checks.sql
-- Photo "uploads" are fixture rows in storage.objects (no files are stored).

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

-- fixture "upload" into feedback-photos by p_owner (as admin)
create function pg_temp.up(p_path text, p_owner uuid) returns text language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, owner_id) values ('feedback-photos', p_path, p_owner::text);
  return p_path;
end $$;

do $$
declare
  uo uuid := gen_random_uuid();   -- owner
  ua uuid := gen_random_uuid();   -- member A
  ub uuid := gen_random_uuid();   -- member B
  ui uuid := gen_random_uuid();   -- signed in, no phone yet
  ur uuid := gen_random_uuid();   -- member used for the rate limit
  f1 uuid := gen_random_uuid();   -- A, named, one photo
  f2 uuid := gen_random_uuid();   -- A, anonymous, two photos
  f3 uuid := gen_random_uuid();   -- B, named, no photos
  fx uuid := gen_random_uuid();   -- never created
  pa text; pb text; pc text; pd text;
  r text;
  cnt int;
  paths text[];
  cid uuid; cid2 uuid;
  ts timestamptz;
  f record;
  rx record;
  i int;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (uo, 'e2e+fchk-owner@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Owner Check"}'),
         (ua, 'e2e+fchk-a@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Alice Check"}'),
         (ub, 'e2e+fchk-b@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Bob Check"}'),
         (ui, 'e2e+fchk-i@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Incomplete Check"}'),
         (ur, 'e2e+fchk-r@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Rate Check"}');
  update public.profiles set phone = '+639990000072' where id in (uo, ua, ub, ur);
  update public.profiles set role = 'owner' where id = uo;

  pa := pg_temp.up(f1 || '/1-800x600.jpg', ua);
  pb := pg_temp.up(f2 || '/1-800x600.jpg', ua);
  pc := pg_temp.up(f2 || '/2-600x800.webp', ua);
  pd := pg_temp.up(f3 || '/1-800x600.jpg', ub);       -- uploaded by B
  perform pg_temp.up(fx || '/1.gif', ua);

  -- ---------------- privileges ----------------
  perform pg_temp.chk('authenticated cannot insert/update feedback directly',
    not has_table_privilege('authenticated', 'public.feedback', 'insert')
    and not has_table_privilege('authenticated', 'public.feedback', 'update'));
  perform pg_temp.chk('authenticated cannot insert/delete feedback_photos directly',
    not has_table_privilege('authenticated', 'public.feedback_photos', 'insert')
    and not has_table_privilege('authenticated', 'public.feedback_photos', 'delete'));
  perform pg_temp.chk('anon cannot execute create_feedback',
    not has_function_privilege('anon', 'public.create_feedback(uuid, text, boolean, text[])', 'execute'));
  perform pg_temp.chk('anon cannot execute the admin feedback functions',
    not has_function_privilege('anon', 'public.admin_set_feedback_status(uuid, public.feedback_status)', 'execute')
    and not has_function_privilege('anon', 'public.admin_reply_feedback(uuid, text)', 'execute'));
  perform pg_temp.chk('anon can read the feedback feed',
    has_function_privilege('anon', 'public.feedback_feed(public.feedback_status, timestamptz, uuid, integer)', 'execute')
    and has_function_privilege('anon', 'public.feedback_comments(uuid)', 'execute'));

  -- ---------------- create_feedback ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, null)', f1, 'hi'));
  perform pg_temp.chk('anon create_feedback → permission denied', r like 'permission denied%', r);

  perform pg_temp.as_user(ui);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, null)', gen_random_uuid(), 'hi'));
  perform pg_temp.chk('incomplete profile → profile_incomplete', r = 'profile_incomplete', r);

  perform pg_temp.as_user(ua);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, null)', f1, '   '));
  perform pg_temp.chk('blank message → invalid_message', r = 'invalid_message', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, null)', f1, repeat('x', 2001)));
  perform pg_temp.chk('message over 2000 → invalid_message', r = 'invalid_message', r);
  r := pg_temp.try(format('select public.create_feedback(null, %L, false, null)', 'hi'));
  perform pg_temp.chk('no feedback id → invalid_feedback', r = 'invalid_feedback', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', f2, 'hi', array[pb, pc, pa]));
  perform pg_temp.chk('3 photos → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', f2, 'hi', array[pb, pb]));
  perform pg_temp.chk('same photo twice → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', f3, 'hi', array[pd]));
  perform pg_temp.chk('photo uploaded by someone else → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', f1, 'hi', array[pb]));
  perform pg_temp.chk('photo of a different feedback → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', f1, 'hi', array[f1 || '/2.jpg']));
  perform pg_temp.chk('photo not uploaded → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', fx, 'hi', array[fx || '/1.gif']));
  perform pg_temp.chk('unsupported file type → invalid_photos', r = 'invalid_photos', r);

  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', f1, '  Net is too low  ', array[pa]));
  perform pg_temp.chk('named feedback with 1 photo → created', r = 'OK', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, true, %L)', f2, 'Lights flicker', array[pc, pb]));
  perform pg_temp.chk('anonymous feedback with 2 photos → created', r = 'OK', r);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L)', f1, 'again', null));
  perform pg_temp.chk('same feedback id again → invalid_feedback', r = 'invalid_feedback', r);

  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, %L::text[])', f3, 'Love the court', '{}'));
  perform pg_temp.chk('no photos (empty array) → created', r = 'OK', r);

  perform pg_temp.as_admin();
  select message || '/' || status into r from public.feedback where id = f1;
  perform pg_temp.chk('message trimmed, status starts open', r = 'Net is too low/open', r);
  select array_agg(path order by position) into paths from public.feedback_photos where feedback_id = f2;
  perform pg_temp.chk('photos keep the order given', paths = array[pc, pb], paths::text);

  -- ---------------- feed + anonymity ----------------
  perform pg_temp.as_anon();
  select count(*) into cnt from public.feedback_feed() where id in (f1, f2, f3);
  perform pg_temp.chk('anon sees the 3 new items', cnt = 3, cnt::text);
  select * into f from public.feedback_feed() where id = f1;
  perform pg_temp.chk('named item: author, message, photo, open, not mine',
    f.author_name = 'Alice Check' and not f.is_anonymous and f.message = 'Net is too low'
    and f.photo_paths = array[pa] and f.status = 'open' and f.owner_reply is null and not f.is_mine,
    f::text);
  select * into f from public.feedback_feed() where id = f2;
  perform pg_temp.chk('anonymous item: no author name', f.author_name is null and f.is_anonymous, f::text);
  perform pg_temp.chk('anonymous item: photo paths carry no user id',
    not exists (select 1 from unnest(f.photo_paths) p where p like '%' || ua::text || '%'), f.photo_paths::text);
  perform pg_temp.chk('anon cannot read the feedback table',
    pg_temp.try('select count(*) from public.feedback') like 'permission denied%');
  perform pg_temp.chk('anon cannot read feedback_photos',
    pg_temp.try('select count(*) from public.feedback_photos') like 'permission denied%');

  perform pg_temp.as_user(ub);
  select * into f from public.feedback_feed() where id = f2;
  perform pg_temp.chk('other member: anonymous item still has no author, not mine', f.author_name is null and not f.is_mine);
  select count(*) into cnt from public.feedback where id = f2;
  perform pg_temp.chk('other member cannot read the raw row', cnt = 0, cnt::text);

  perform pg_temp.as_user(ua);
  select * into f from public.feedback_feed() where id = f2;
  perform pg_temp.chk('author sees is_mine on own anonymous item', f.is_mine and f.author_name is null);

  select count(*) into cnt from public.feedback_feed(null, null, null, 1);
  perform pg_temp.chk('limit 1 → 1 row', cnt = 1, cnt::text);
  select * into f from public.feedback_feed(null, null, null, 1);
  select * into rx from public.feedback_feed(null, f.created_at, f.id, 1);
  perform pg_temp.chk('next page starts after the last row', rx.id is distinct from f.id
    and (rx.created_at, rx.id) < (f.created_at, f.id), coalesce(rx.id::text, 'none'));
  select count(*) into cnt from public.feedback_feed(null, null, null, 500);
  perform pg_temp.chk('limit is capped at 30', cnt <= 30, cnt::text);

  -- ---------------- owner: status ----------------
  perform pg_temp.as_user(ua);
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, %L)', f1, 'resolved'));
  perform pg_temp.chk('member sets status → not_owner', r = 'not_owner', r);
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, %L)', f1, 'resolved'));
  perform pg_temp.chk('anon sets status → permission denied', r like 'permission denied%', r);

  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, null)', f1));
  perform pg_temp.chk('null status → invalid_status', r = 'invalid_status', r);
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, %L)', fx, 'resolved'));
  perform pg_temp.chk('missing feedback → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, %L)', f1, 'in_progress'));
  perform pg_temp.chk('owner sets in_progress', r = 'OK', r);
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, %L)', f1, 'in_progress'));
  perform pg_temp.chk('setting the same status again is fine', r = 'OK', r);
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, %L)', f3, 'resolved'));

  perform pg_temp.as_anon();
  select count(*) into cnt from public.feedback_feed('in_progress') where id in (f1, f2, f3);
  perform pg_temp.chk('filter in_progress → only that item', cnt = 1, cnt::text);
  select count(*) into cnt from public.feedback_feed('open') where id in (f1, f2, f3);
  perform pg_temp.chk('filter open → only the untouched item', cnt = 1, cnt::text);
  select count(*) into cnt from public.feedback_feed('resolved') where id in (f1, f2, f3);
  perform pg_temp.chk('filter resolved → 1', cnt = 1, cnt::text);

  -- ---------------- owner: reply ----------------
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select public.admin_reply_feedback(%L, %L)', f1, 'thanks'));
  perform pg_temp.chk('member replies → not_owner', r = 'not_owner', r);

  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_reply_feedback(%L, %L)', f1, repeat('r', 2001)));
  perform pg_temp.chk('reply over 2000 → invalid_reply', r = 'invalid_reply', r);
  r := pg_temp.try(format('select public.admin_reply_feedback(%L, %L)', fx, 'hello'));
  perform pg_temp.chk('reply to missing feedback → not_found', r = 'not_found', r);
  select public.admin_reply_feedback(f1, '  Raising it this week.  ') into ts;
  perform pg_temp.chk('owner replies → replied_at', ts is not null);

  perform pg_temp.as_anon();
  select * into f from public.feedback_feed() where id = f1;
  perform pg_temp.chk('feed shows the trimmed reply + time',
    f.owner_reply = 'Raising it this week.' and f.replied_at is not null, f.owner_reply);

  perform pg_temp.as_admin();
  update public.feedback set replied_at = replied_at - interval '1 day' where id = f1;
  select replied_at into ts from public.feedback where id = f1;
  perform pg_temp.as_user(uo);
  perform public.admin_reply_feedback(f1, 'Raising it this week.');
  perform pg_temp.as_admin();
  perform pg_temp.chk('unchanged reply keeps its time',
    (select replied_at from public.feedback where id = f1) = ts);

  perform pg_temp.as_user(uo);
  select public.admin_reply_feedback(f1, '   ') into ts;
  perform pg_temp.as_admin();
  select * into f from public.feedback where id = f1;
  perform pg_temp.chk('empty reply clears reply + time', ts is null and f.owner_reply is null and f.replied_at is null);
  perform pg_temp.as_user(uo);
  perform public.admin_reply_feedback(f1, 'Fixed the net.');

  -- ---------------- reactions ----------------
  perform pg_temp.as_user(ui);
  r := pg_temp.try(format('select * from public.set_feedback_reaction(%L, %L)', f1, 'like'));
  perform pg_temp.chk('incomplete profile react → profile_incomplete', r = 'profile_incomplete', r);
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select * from public.set_feedback_reaction(%L, %L)', f1, 'like'));
  perform pg_temp.chk('anon react → permission denied', r like 'permission denied%', r);

  perform pg_temp.as_user(ub);
  select * into rx from public.set_feedback_reaction(f1, 'like');
  perform pg_temp.chk('like → 1 like', rx.like_count = 1 and rx.haha_count = 0 and rx.my_reaction = 'like', rx::text);
  select * into rx from public.set_feedback_reaction(f1, 'haha');
  perform pg_temp.chk('switch to haha → 0 / 1', rx.like_count = 0 and rx.haha_count = 1 and rx.my_reaction = 'haha', rx::text);
  perform pg_temp.as_user(ua);
  select * into rx from public.set_feedback_reaction(f1, 'like');
  select * into rx from public.set_feedback_reaction(f2, 'like');   -- author likes own anonymous item
  perform pg_temp.as_user(ub);
  select * into f from public.feedback_feed() where id = f1;
  perform pg_temp.chk('feed counts + my reaction', f.like_count = 1 and f.haha_count = 1 and f.my_reaction = 'haha',
    f.like_count || '/' || f.haha_count);
  select * into rx from public.set_feedback_reaction(f1, null);
  perform pg_temp.chk('remove → 1 / 0, none mine', rx.like_count = 1 and rx.haha_count = 0 and rx.my_reaction is null, rx::text);
  r := pg_temp.try(format('select * from public.set_feedback_reaction(%L, %L)', fx, 'like'));
  perform pg_temp.chk('react on missing feedback → not_found', r = 'not_found', r);

  -- ---------------- comments ----------------
  perform pg_temp.as_user(ui);
  r := pg_temp.try(format('select * from public.comment_on_feedback(%L, %L)', f1, 'hello'));
  perform pg_temp.chk('incomplete profile comment → profile_incomplete', r = 'profile_incomplete', r);
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select * from public.comment_on_feedback(%L, %L)', f1, '  '));
  perform pg_temp.chk('blank comment → invalid_comment', r = 'invalid_comment', r);
  r := pg_temp.try(format('select * from public.comment_on_feedback(%L, %L)', fx, 'hello'));
  perform pg_temp.chk('comment on missing feedback → not_found', r = 'not_found', r);

  select x.id into cid from public.comment_on_feedback(f2, ' Same here ') x;
  perform pg_temp.chk('member B comments', cid is not null);
  perform pg_temp.as_user(ua);
  select x.id into cid2 from public.comment_on_feedback(f2, 'Thanks') x;   -- author on own anonymous item
  perform pg_temp.as_admin();
  update public.comments set created_at = created_at - interval '2 minutes' where id = cid;

  perform pg_temp.as_anon();
  select count(*) into cnt from public.feedback_comments(f2);
  perform pg_temp.chk('anon reads 2 comments', cnt = 2, cnt::text);
  select * into rx from public.feedback_comments(f2) limit 1;
  perform pg_temp.chk('oldest first, trimmed, author name, not mine',
    rx.id = cid and rx.body = 'Same here' and rx.author_name = 'Bob Check' and not rx.is_mine, rx::text);
  select comment_count into cnt from public.feedback_feed() where id = f2;
  perform pg_temp.chk('feed comment_count = 2', cnt = 2, cnt::text);

  -- comments/reactions on feedback carry user_id: not readable from the tables
  select count(*) into cnt from public.comments where feedback_id = f2;
  perform pg_temp.chk('anon table read: no feedback comments', cnt = 0, cnt::text);
  select count(*) into cnt from public.reactions where feedback_id in (f1, f2);
  perform pg_temp.chk('anon table read: no feedback reactions', cnt = 0, cnt::text);
  perform pg_temp.as_user(ub);
  select count(*) into cnt from public.comments where feedback_id = f2;
  perform pg_temp.chk('member table read: no feedback comments', cnt = 0, cnt::text);
  select count(*) into cnt from public.reactions where feedback_id in (f1, f2);
  perform pg_temp.chk('member table read: no feedback reactions', cnt = 0, cnt::text);
  perform pg_temp.as_user(uo);
  select count(*) into cnt from public.comments where feedback_id = f2;
  perform pg_temp.chk('owner reads feedback comments (moderation)', cnt = 2, cnt::text);
  select count(*) into cnt from public.reactions where feedback_id in (f1, f2);
  perform pg_temp.chk('owner reads feedback reactions', cnt = 2, cnt::text);

  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select public.delete_comment(%L)', cid2));
  perform pg_temp.chk('deleting someone else''s feedback comment → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.delete_comment(%L)', cid));
  perform pg_temp.chk('author deletes own feedback comment', r = 'OK', r);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.delete_comment(%L)', cid2));
  perform pg_temp.chk('owner deletes any feedback comment', r = 'OK', r);
  perform pg_temp.as_anon();
  select count(*) into cnt from public.feedback_comments(f2);
  perform pg_temp.chk('deleted feedback comments are hidden', cnt = 0, cnt::text);

  -- ---------------- delete feedback ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.delete_feedback(%L)', f1));
  perform pg_temp.chk('anon delete_feedback → permission denied', r like 'permission denied%', r);
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select public.delete_feedback(%L)', f2));
  perform pg_temp.chk('other member delete → not_found', r = 'not_found', r);
  perform pg_temp.as_user(ua);
  select public.delete_feedback(f2) into paths;
  perform pg_temp.chk('author deletes own feedback → photo paths', paths = array[pc, pb], paths::text);
  select public.delete_feedback(f2) into paths;
  perform pg_temp.chk('deleting again returns the paths again', paths = array[pc, pb], paths::text);
  perform pg_temp.as_user(uo);
  select public.delete_feedback(f3) into paths;
  perform pg_temp.chk('owner deletes someone''s feedback (no photos) → empty', paths = '{}'::text[], paths::text);

  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select * from public.set_feedback_reaction(%L, %L)', f2, 'like'));
  perform pg_temp.chk('react on deleted feedback → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select * from public.comment_on_feedback(%L, %L)', f2, 'hello?'));
  perform pg_temp.chk('comment on deleted feedback → not_found', r = 'not_found', r);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.admin_set_feedback_status(%L, %L)', f2, 'resolved'));
  perform pg_temp.chk('status on deleted feedback → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.admin_reply_feedback(%L, %L)', f2, 'hi'));
  perform pg_temp.chk('reply on deleted feedback → not_found', r = 'not_found', r);
  select count(*) into cnt from public.feedback where id in (f2, f3);
  perform pg_temp.chk('owner still reads deleted feedback', cnt = 2, cnt::text);

  perform pg_temp.as_anon();
  select count(*) into cnt from public.feedback_feed(null, null, null, 30) where id in (f2, f3);
  perform pg_temp.chk('deleted feedback leaves the feed', cnt = 0, cnt::text);
  perform pg_temp.as_user(ua);
  select count(*) into cnt from public.feedback where id = f2;
  perform pg_temp.chk('author no longer reads own deleted row', cnt = 0, cnt::text);

  -- ---------------- storage policies ----------------
  perform pg_temp.as_user(ua);
  r := pg_temp.try(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'feedback-photos', gen_random_uuid() || '/1-800x600.jpg', ua));
  perform pg_temp.chk('member uploads to <feedback_id>/<file>', r = 'OK', r);
  r := pg_temp.try(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'feedback-photos', ua || '/' || gen_random_uuid() || '/1.jpg', ua));
  perform pg_temp.chk('old <user_id>/<feedback_id>/ path is refused', r like '%row-level security%', r);
  r := pg_temp.try(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'feedback-photos', gen_random_uuid() || '/1.jpg', ub));
  perform pg_temp.chk('upload claiming another owner is refused', r like '%row-level security%', r);
  r := pg_temp.try(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'feedback-photos', gen_random_uuid() || '/1.svg', ua));
  perform pg_temp.chk('non-image extension is refused', r like '%row-level security%', r);
  perform pg_temp.as_user(ui);
  r := pg_temp.try(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'feedback-photos', gen_random_uuid() || '/1.jpg', ui));
  perform pg_temp.chk('incomplete profile cannot upload', r like '%row-level security%', r);

  perform pg_temp.as_user(ub);
  select count(*) into cnt from storage.objects where bucket_id = 'feedback-photos' and name = pa;
  perform pg_temp.chk('member cannot list another member''s file', cnt = 0, cnt::text);
  select count(*) into cnt from storage.objects where bucket_id = 'feedback-photos' and name = pd;
  perform pg_temp.chk('uploader lists own file', cnt = 1, cnt::text);
  perform pg_temp.as_user(uo);
  select count(*) into cnt from storage.objects where bucket_id = 'feedback-photos' and name in (pa, pb, pc, pd);
  perform pg_temp.chk('owner lists all feedback files', cnt = 4, cnt::text);
  perform pg_temp.as_anon();
  select count(*) into cnt from storage.objects where bucket_id = 'feedback-photos' and name = pa;
  perform pg_temp.chk('anon cannot list feedback files', cnt = 0, cnt::text);

  -- ---------------- rate limit ----------------
  perform pg_temp.as_admin();
  for i in 1..6 loop
    fx := gen_random_uuid();
    perform pg_temp.as_user(ur);
    r := pg_temp.try(format('select public.create_feedback(%L, %L, false, null)', fx, 'item ' || i));
    if i = 1 then
      perform public.delete_feedback(fx);  -- deleted items still count
    end if;
    perform pg_temp.as_admin();
  end loop;
  perform pg_temp.chk('6th feedback in 24 hours → rate_limited (deleted ones count)', r = 'rate_limited', r);
  select count(*) into cnt from public.feedback where user_id = ur;
  perform pg_temp.chk('only 5 items were made', cnt = 5, cnt::text);
  update public.feedback set created_at = now() - interval '25 hours'
   where id = (select id from public.feedback where user_id = ur order by created_at, id limit 1);
  perform pg_temp.as_user(ur);
  r := pg_temp.try(format('select public.create_feedback(%L, %L, false, null)', gen_random_uuid(), 'next day'));
  perform pg_temp.chk('an item older than 24 hours frees a slot', r = 'OK', r);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 70) as detail from _results order by n;

rollback;
