-- Community feed checks (Phase 5). Runs in one transaction and ROLLS BACK (leaves no data).
-- Run after the migration is applied:
--   npx supabase db query --remote -o table -f supabase/checks/community_checks.sql
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

-- fixture "upload": a storage.objects row in community-photos (as admin)
create function pg_temp.up(p_path text) returns text language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values ('community-photos', p_path);
  return p_path;
end $$;

do $$
declare
  uo uuid := gen_random_uuid();   -- owner
  ua uuid := gen_random_uuid();   -- member A
  ub uuid := gen_random_uuid();   -- member B
  ui uuid := gen_random_uuid();   -- signed in, no phone yet
  ur uuid := gen_random_uuid();   -- member used for the rate limits
  p1 uuid := gen_random_uuid();   -- A, one photo
  p2 uuid := gen_random_uuid();   -- A, two photos
  p3 uuid := gen_random_uuid();   -- B, one photo
  px uuid := gen_random_uuid();   -- never created
  pa text; pb text; pc text; pd text;
  r text;
  cnt int;
  paths text[];
  cid uuid; cid2 uuid; cid3 uuid;
  ts timestamptz;
  f record;
  rx record;
  i int;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (uo, 'e2e+cchk-owner@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Owner Check"}'),
         (ua, 'e2e+cchk-a@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Alice Check"}'),
         (ub, 'e2e+cchk-b@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Bob Check"}'),
         (ui, 'e2e+cchk-i@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Incomplete Check"}'),
         (ur, 'e2e+cchk-r@dinkndrive.test', 'authenticated', 'authenticated', '{"full_name":"Rate Check"}');
  update public.profiles set phone = '+639990000071' where id in (uo, ua, ub, ur);
  update public.profiles set role = 'owner' where id = uo;

  pa := pg_temp.up(ua || '/' || p1 || '/1.webp');
  pb := pg_temp.up(ua || '/' || p2 || '/1.jpg');
  pc := pg_temp.up(ua || '/' || p2 || '/2.png');
  pd := pg_temp.up(ub || '/' || p3 || '/1.webp');
  perform pg_temp.up(ua || '/' || px || '/1.gif');

  -- ---------------- privileges: direct writes are closed ----------------
  perform pg_temp.chk('authenticated cannot insert posts directly', not has_table_privilege('authenticated', 'public.posts', 'insert'));
  perform pg_temp.chk('authenticated cannot update posts directly', not has_table_privilege('authenticated', 'public.posts', 'update'));
  perform pg_temp.chk('authenticated cannot insert/delete post_photos directly',
    not has_table_privilege('authenticated', 'public.post_photos', 'insert')
    and not has_table_privilege('authenticated', 'public.post_photos', 'delete'));
  perform pg_temp.chk('authenticated cannot insert/update comments directly',
    not has_table_privilege('authenticated', 'public.comments', 'insert')
    and not has_table_privilege('authenticated', 'public.comments', 'update'));
  perform pg_temp.chk('authenticated cannot write reactions directly (incl. type column)',
    not has_table_privilege('authenticated', 'public.reactions', 'insert')
    and not has_table_privilege('authenticated', 'public.reactions', 'delete')
    and not has_column_privilege('authenticated', 'public.reactions', 'type', 'update'));
  perform pg_temp.chk('anon cannot execute create_post', not has_function_privilege('anon', 'public.create_post(uuid, text, text[])', 'execute'));
  perform pg_temp.chk('anon cannot execute set_post_reaction',
    not has_function_privilege('anon', 'public.set_post_reaction(uuid, public.reaction_type)', 'execute'));
  perform pg_temp.chk('anon can read the feed', has_function_privilege('anon', 'public.community_feed(timestamptz, uuid, integer)', 'execute'));

  -- ---------------- create_post ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p1, 'hi', array[pa]));
  perform pg_temp.chk('anon create_post → permission denied', r like 'permission denied%', r);

  perform pg_temp.as_user(ui);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', gen_random_uuid(), 'hi', array[pa]));
  perform pg_temp.chk('incomplete profile → profile_incomplete', r = 'profile_incomplete', r);

  perform pg_temp.as_user(ua);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L::text[])', p1, 'hi', '{}'));
  perform pg_temp.chk('no photos → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, null)', p1, 'hi'));
  perform pg_temp.chk('null photos → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p2, 'hi', array[pb, pc, pa]));
  perform pg_temp.chk('3 photos → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p2, 'hi', array[pb, pb]));
  perform pg_temp.chk('same photo twice → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p3, 'hi', array[pd]));
  perform pg_temp.chk('photo in someone else''s folder → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p1, 'hi', array[pb]));
  perform pg_temp.chk('photo of a different post → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p1, 'hi', array[ua || '/' || p1 || '/2.webp']));
  perform pg_temp.chk('photo not uploaded → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', px, 'hi', array[ua || '/' || px || '/1.gif']));
  perform pg_temp.chk('unsupported file type → invalid_photos', r = 'invalid_photos', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p1, repeat('x', 2001), array[pa]));
  perform pg_temp.chk('caption over 2000 → invalid_caption', r = 'invalid_caption', r);
  r := pg_temp.try(format('select public.create_post(null, %L, %L)', 'hi', array[pa]));
  perform pg_temp.chk('no post id → invalid_post', r = 'invalid_post', r);

  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p1, '  Good game!  ', array[pa]));
  perform pg_temp.chk('1 photo + caption → created', r = 'OK', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p2, '', array[pc, pb]));
  perform pg_temp.chk('2 photos, empty caption → created', r = 'OK', r);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p1, 'again', array[pa]));
  perform pg_temp.chk('same post id again → invalid_post', r = 'invalid_post', r);

  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', p3, 'Bob here', array[pd]));
  perform pg_temp.chk('member B posts', r = 'OK', r);

  perform pg_temp.as_admin();
  select caption into r from public.posts where id = p1;
  perform pg_temp.chk('caption is trimmed', r = 'Good game!', r);
  select array_agg(path order by position) into paths from public.post_photos where post_id = p2;
  perform pg_temp.chk('photos keep the order given', paths = array[pc, pb], paths::text);

  -- ---------------- feed ----------------
  perform pg_temp.as_anon();
  select count(*) into cnt from public.community_feed() where id in (p1, p2, p3);
  perform pg_temp.chk('anon sees the 3 new posts', cnt = 3, cnt::text);
  select * into f from public.community_feed() where id = p1;
  perform pg_temp.chk('feed: author name, caption, photo, not mine',
    f.author_name = 'Alice Check' and f.caption = 'Good game!' and f.photo_paths = array[pa]
    and not f.is_mine and f.my_reaction is null and f.edited_at is null,
    f.author_name || ' / ' || f.is_mine::text);
  perform pg_temp.chk('anon still cannot read profiles',
    pg_temp.try('select count(*) from public.profiles') like 'permission denied%');

  perform pg_temp.as_user(ua);
  select * into f from public.community_feed() where id = p2;
  perform pg_temp.chk('feed: author sees is_mine, 2 photos in order', f.is_mine and f.photo_paths = array[pc, pb], f.photo_paths::text);

  select count(*) into cnt from public.community_feed(null, null, 1);
  perform pg_temp.chk('limit 1 → 1 row', cnt = 1, cnt::text);
  select * into f from public.community_feed(null, null, 1);
  select * into rx from public.community_feed(f.created_at, f.id, 1);
  perform pg_temp.chk('next page starts after the last row', rx.id is distinct from f.id
    and (rx.created_at, rx.id) < (f.created_at, f.id), coalesce(rx.id::text, 'none'));
  select count(*) into cnt from public.community_feed(null, null, 500);
  perform pg_temp.chk('limit is capped at 30', cnt <= 30, cnt::text);

  -- ---------------- edit caption ----------------
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select public.edit_post_caption(%L, %L)', p1, 'hijack'));
  perform pg_temp.chk('other member edit → not_found', r = 'not_found', r);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.edit_post_caption(%L, %L)', p1, 'owner edit'));
  perform pg_temp.chk('owner cannot edit someone''s caption → not_found', r = 'not_found', r);
  perform pg_temp.as_user(ua);
  r := pg_temp.try(format('select public.edit_post_caption(%L, %L)', p1, 'Good game!'));
  perform pg_temp.as_admin();
  select edited_at::text into r from public.posts where id = p1;
  perform pg_temp.chk('same caption → not marked edited', r is null, r);
  perform pg_temp.as_user(ua);
  r := pg_temp.try(format('select public.edit_post_caption(%L, %L)', p1, repeat('y', 2001)));
  perform pg_temp.chk('edit over 2000 → invalid_caption', r = 'invalid_caption', r);
  r := pg_temp.try(format('select public.edit_post_caption(%L, %L)', p1, ' Great game! '));
  perform pg_temp.chk('author edits caption', r = 'OK', r);
  select * into f from public.community_feed() where id = p1;
  perform pg_temp.chk('feed shows the new caption + edited_at', f.caption = 'Great game!' and f.edited_at is not null, f.caption);
  perform pg_temp.as_admin();
  select count(*) into cnt from public.post_photos where post_id = p1;
  perform pg_temp.chk('editing leaves the photos', cnt = 1, cnt::text);

  -- ---------------- reactions ----------------
  perform pg_temp.as_user(ui);
  r := pg_temp.try(format('select * from public.set_post_reaction(%L, %L)', p1, 'like'));
  perform pg_temp.chk('incomplete profile react → profile_incomplete', r = 'profile_incomplete', r);

  perform pg_temp.as_user(ub);
  select * into rx from public.set_post_reaction(p1, 'like');
  perform pg_temp.chk('like → 1 like', rx.like_count = 1 and rx.haha_count = 0 and rx.my_reaction = 'like', rx::text);
  select * into rx from public.set_post_reaction(p1, 'haha');
  perform pg_temp.chk('switch to haha → 0 like, 1 haha', rx.like_count = 0 and rx.haha_count = 1 and rx.my_reaction = 'haha', rx::text);
  perform pg_temp.as_user(ua);
  select * into rx from public.set_post_reaction(p1, 'like');
  perform pg_temp.chk('second member likes → 1 / 1', rx.like_count = 1 and rx.haha_count = 1, rx::text);
  perform pg_temp.as_user(ub);
  select * into f from public.community_feed() where id = p1;
  perform pg_temp.chk('feed counts + my reaction', f.like_count = 1 and f.haha_count = 1 and f.my_reaction = 'haha', f.like_count || '/' || f.haha_count);
  select * into rx from public.set_post_reaction(p1, null);
  perform pg_temp.chk('remove → 1 / 0, none mine', rx.like_count = 1 and rx.haha_count = 0 and rx.my_reaction is null, rx::text);
  perform pg_temp.as_admin();
  select count(*) into cnt from public.reactions where post_id = p1;
  perform pg_temp.chk('one reaction row per user per post', cnt = 1, cnt::text);

  -- ---------------- comments ----------------
  perform pg_temp.as_user(ui);
  r := pg_temp.try(format('select * from public.comment_on_post(%L, %L)', p1, 'hello'));
  perform pg_temp.chk('incomplete profile comment → profile_incomplete', r = 'profile_incomplete', r);
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select * from public.comment_on_post(%L, %L)', p1, '   '));
  perform pg_temp.chk('blank comment → invalid_comment', r = 'invalid_comment', r);
  r := pg_temp.try(format('select * from public.comment_on_post(%L, %L)', p1, repeat('z', 1001)));
  perform pg_temp.chk('comment over 1000 → invalid_comment', r = 'invalid_comment', r);
  r := pg_temp.try(format('select * from public.comment_on_post(%L, %L)', px, 'hello'));
  perform pg_temp.chk('comment on a missing post → not_found', r = 'not_found', r);

  select x.id into cid from public.comment_on_post(p1, ' Nice one ') x;
  perform pg_temp.chk('member B comments', cid is not null);
  select x.id into cid2 from public.comment_on_post(p1, 'Again tomorrow?') x;
  perform pg_temp.as_user(ua);
  select x.id into cid3 from public.comment_on_post(p1, 'Sure!') x;
  -- one transaction = one now(): spread the fixtures out so "oldest first" is testable
  perform pg_temp.as_admin();
  update public.comments set created_at = created_at - interval '3 minutes' where id = cid;
  update public.comments set created_at = created_at - interval '2 minutes' where id = cid2;

  perform pg_temp.as_anon();
  select count(*) into cnt from public.post_comments(p1);
  perform pg_temp.chk('anon reads 3 comments', cnt = 3, cnt::text);
  select * into rx from public.post_comments(p1) limit 1;
  perform pg_temp.chk('oldest first, trimmed, author name, not mine',
    rx.id = cid and rx.body = 'Nice one' and rx.author_name = 'Bob Check' and not rx.is_mine, rx::text);
  select comment_count into cnt from public.community_feed() where id = p1;
  perform pg_temp.chk('feed comment_count = 3', cnt = 3, cnt::text);

  perform pg_temp.as_user(ub);
  select count(*) into cnt from public.post_comments(p1) where is_mine;
  perform pg_temp.chk('author sees is_mine on own comments', cnt = 2, cnt::text);
  r := pg_temp.try(format('select public.delete_comment(%L)', cid3));
  perform pg_temp.chk('deleting someone else''s comment → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select public.delete_comment(%L)', cid));
  perform pg_temp.chk('author deletes own comment', r = 'OK', r);
  r := pg_temp.try(format('select public.delete_comment(%L)', cid));
  perform pg_temp.chk('deleting it again is fine', r = 'OK', r);
  perform pg_temp.as_user(uo);
  r := pg_temp.try(format('select public.delete_comment(%L)', cid3));
  perform pg_temp.chk('owner deletes any comment', r = 'OK', r);
  perform pg_temp.as_anon();
  select count(*) into cnt from public.post_comments(p1);
  perform pg_temp.chk('deleted comments are hidden', cnt = 1, cnt::text);
  select count(*) into cnt from public.comments where post_id = p1;
  perform pg_temp.chk('anon table read hides deleted comments too', cnt = 1, cnt::text);
  perform pg_temp.as_user(uo);
  select count(*) into cnt from public.comments where post_id = p1;
  perform pg_temp.chk('owner still reads deleted comments', cnt = 3, cnt::text);

  -- ---------------- delete posts ----------------
  perform pg_temp.as_anon();
  r := pg_temp.try(format('select public.delete_post(%L)', p1));
  perform pg_temp.chk('anon delete_post → permission denied', r like 'permission denied%', r);
  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select public.delete_post(%L)', p2));
  perform pg_temp.chk('other member delete → not_found', r = 'not_found', r);
  perform pg_temp.as_user(ua);
  select public.delete_post(p2) into paths;
  perform pg_temp.chk('author deletes own post → photo paths', paths = array[pc, pb], paths::text);
  select public.delete_post(p2) into paths;
  perform pg_temp.chk('deleting again returns the paths again', paths = array[pc, pb], paths::text);
  r := pg_temp.try(format('select public.edit_post_caption(%L, %L)', p2, 'too late'));
  perform pg_temp.chk('editing a deleted post → not_found', r = 'not_found', r);
  perform pg_temp.as_user(uo);
  select public.delete_post(p1) into paths;
  perform pg_temp.chk('owner deletes someone''s post → photo paths', paths = array[pa], paths::text);

  perform pg_temp.as_user(ub);
  r := pg_temp.try(format('select * from public.set_post_reaction(%L, %L)', p1, 'like'));
  perform pg_temp.chk('react on a deleted post → not_found', r = 'not_found', r);
  r := pg_temp.try(format('select * from public.comment_on_post(%L, %L)', p1, 'hello?'));
  perform pg_temp.chk('comment on a deleted post → not_found', r = 'not_found', r);

  perform pg_temp.as_anon();
  select count(*) into cnt from public.community_feed(null, null, 30) where id in (p1, p2);
  perform pg_temp.chk('deleted posts leave the feed', cnt = 0, cnt::text);
  select count(*) into cnt from public.post_comments(p1);
  perform pg_temp.chk('comments of a deleted post are hidden', cnt = 0, cnt::text);
  select count(*) into cnt from public.posts where id in (p1, p2);
  perform pg_temp.chk('anon table read hides deleted posts', cnt = 0, cnt::text);
  select count(*) into cnt from public.post_photos where post_id in (p1, p2);
  perform pg_temp.chk('anon table read hides deleted posts'' photos', cnt = 0, cnt::text);
  perform pg_temp.as_user(uo);
  select count(*) into cnt from public.posts where id in (p1, p2);
  perform pg_temp.chk('owner still reads deleted posts', cnt = 2, cnt::text);

  -- ---------------- rate limits ----------------
  perform pg_temp.as_admin();
  for i in 1..6 loop
    px := gen_random_uuid();
    perform pg_temp.up(ur || '/' || px || '/1.webp');
    perform pg_temp.as_user(ur);
    r := pg_temp.try(format('select public.create_post(%L, %L, %L)', px, 'post ' || i, array[ur || '/' || px || '/1.webp']));
    if i = 1 then
      perform public.delete_post(px);  -- deleted posts still count
    end if;
    perform pg_temp.as_admin();
  end loop;
  perform pg_temp.chk('6th post in an hour → rate_limited (deleted ones count)', r = 'rate_limited', r);
  select count(*) into cnt from public.posts where user_id = ur;
  perform pg_temp.chk('only 5 posts were made', cnt = 5, cnt::text);
  update public.posts set created_at = now() - interval '61 minutes'
   where id = (select id from public.posts where user_id = ur order by created_at, id limit 1);
  px := gen_random_uuid();
  perform pg_temp.up(ur || '/' || px || '/1.webp');
  perform pg_temp.as_user(ur);
  r := pg_temp.try(format('select public.create_post(%L, %L, %L)', px, 'later', array[ur || '/' || px || '/1.webp']));
  perform pg_temp.chk('a post older than an hour frees a slot', r = 'OK', r);

  for i in 1..31 loop
    r := pg_temp.try(format('select * from public.comment_on_post(%L, %L)', p3, 'c' || i));
  end loop;
  perform pg_temp.chk('31st comment in an hour → rate_limited', r = 'rate_limited', r);
  select count(*) into cnt from public.post_comments(p3);
  perform pg_temp.chk('only 30 comments were made', cnt = 30, cnt::text);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 70) as detail from _results order by n;

rollback;
