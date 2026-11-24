-- Phase 5 · community feed functions
-- Spec: docs/SPEC.md §7 (community page), §10 (data model).
--
--   community_feed(before, before_id, limit)       anyone     page of live posts, newest first
--   post_comments(post)                             anyone     live comments on a live post, oldest first
--   create_post(id, caption, photo_paths)           member     post with 1–2 photos already uploaded
--   edit_post_caption(post, caption)                author     caption only; photos never change
--   delete_post(post)                               author/owner  soft delete → returns photo paths to remove
--   comment_on_post(post, body)                     member
--   delete_comment(comment)                         author/owner  soft delete
--   set_post_reaction(post, type | null)            member     like / haha / remove → new counts
--
-- "member" = signed in with a complete profile (full name + phone).
--
-- Every post has 1 or 2 photos (decided with the developer), so posts and their
-- photos are created together by create_post only. All community writes go
-- through these functions; direct table writes are revoked. Phase 6 adds the
-- feedback versions (comments on feedback also go through a function).
--
-- Authors are shown by full_name only. The functions return names and an
-- is_mine flag — never user ids, phone or email.
--
-- Rate limits are triggers, so they hold for every insert path:
--   5 posts per hour, 30 comments per hour (posts and feedback combined) per user.
--   Deleted rows still count, so deleting and re-posting doesn't reset the limit.
--
-- Photo flow: the app picks the post id, the browser uploads to
-- community-photos/<user_id>/<post_id>/<1|2>.<ext> (storage RLS: own folder,
-- complete profile), then calls create_post, which checks each file exists.

-- ---------------------------------------------------------------------------
-- posts: remember caption edits
-- ---------------------------------------------------------------------------
alter table public.posts add column edited_at timestamptz;

-- ---------------------------------------------------------------------------
-- private helpers
-- ---------------------------------------------------------------------------

-- Signed in with a complete profile; returns the caller's id.
create or replace function private.require_member()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not private.has_complete_profile() then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- Caption: trimmed, may be empty, at most 2000 characters.
create or replace function private.clean_caption(p_caption text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := coalesce(btrim(p_caption), '');
begin
  if char_length(v) > 2000 then
    raise exception 'invalid_caption' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Comment body: trimmed, 1–1000 characters.
create or replace function private.clean_comment(p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := coalesce(btrim(p_body), '');
begin
  if char_length(v) not between 1 and 1000 then
    raise exception 'invalid_comment' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

revoke all on function private.require_member() from public, anon, authenticated;
revoke all on function private.clean_caption(text) from public, anon, authenticated;
revoke all on function private.clean_comment(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limits (raise 'rate_limited', detail = the hourly limit)
-- The advisory lock makes two inserts at the same moment count each other.
-- ---------------------------------------------------------------------------
create or replace function private.limit_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('posts:' || new.user_id::text, 0));
  if (select count(*) from public.posts
       where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = '5';
  end if;
  return new;
end;
$$;

create or replace function private.limit_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('comments:' || new.user_id::text, 0));
  if (select count(*) from public.comments
       where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = '30';
  end if;
  return new;
end;
$$;

revoke all on function private.limit_posts() from public, anon, authenticated;
revoke all on function private.limit_comments() from public, anon, authenticated;

create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function private.limit_posts();

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function private.limit_comments();

-- ---------------------------------------------------------------------------
-- community_feed: live posts, newest first, keyset paging on (created_at, id).
-- Pass the last row's created_at and id to get the next page.
-- ---------------------------------------------------------------------------
create or replace function public.community_feed(
  p_before    timestamptz default null,
  p_before_id uuid default null,
  p_limit     integer default 10
)
returns table (
  id            uuid,
  author_name   text,
  caption       text,
  created_at    timestamptz,
  edited_at     timestamptz,
  photo_paths   text[],
  like_count    integer,
  haha_count    integer,
  comment_count integer,
  my_reaction   public.reaction_type,
  is_mine       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    coalesce(pr.full_name, 'Member'),
    p.caption,
    p.created_at,
    p.edited_at,
    coalesce((select array_agg(ph.path order by ph.position)
                from public.post_photos ph where ph.post_id = p.id), '{}'),
    (select count(*)::integer from public.reactions r where r.post_id = p.id and r.type = 'like'),
    (select count(*)::integer from public.reactions r where r.post_id = p.id and r.type = 'haha'),
    (select count(*)::integer from public.comments c where c.post_id = p.id and c.deleted_at is null),
    (select r.type from public.reactions r where r.post_id = p.id and r.user_id = auth.uid()),
    p.user_id is not distinct from auth.uid()
  from public.posts p
  left join public.profiles pr on pr.id = p.user_id
  where p.deleted_at is null
    and (p_before is null
         or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

-- ---------------------------------------------------------------------------
-- post_comments: live comments on a live post, oldest first (at most 500).
-- ---------------------------------------------------------------------------
create or replace function public.post_comments(p_post_id uuid)
returns table (
  id          uuid,
  author_name text,
  body        text,
  created_at  timestamptz,
  is_mine     boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    coalesce(pr.full_name, 'Member'),
    c.body,
    c.created_at,
    c.user_id is not distinct from auth.uid()
  from public.comments c
  join public.posts p on p.id = c.post_id and p.deleted_at is null
  left join public.profiles pr on pr.id = c.user_id
  where c.post_id = p_post_id
    and c.deleted_at is null
  order by c.created_at, c.id
  limit 500;
$$;

-- ---------------------------------------------------------------------------
-- create_post: the photos must already be uploaded to
-- community-photos/<caller>/<post id>/<name>.<jpg|jpeg|png|webp>.
-- ---------------------------------------------------------------------------
create or replace function public.create_post(
  p_post_id     uuid,
  p_caption     text,
  p_photo_paths text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_member();
  v_caption text := private.clean_caption(p_caption);
  v_prefix  text;
  v_path    text;
  v_count   integer := 0;
begin
  if p_post_id is null then
    raise exception 'invalid_post' using errcode = 'P0001';
  end if;
  if p_photo_paths is null
     or coalesce(array_ndims(p_photo_paths), 1) <> 1
     or cardinality(p_photo_paths) not between 1 and 2
     or cardinality(p_photo_paths) <> (select count(distinct x) from unnest(p_photo_paths) x) then
    raise exception 'invalid_photos' using errcode = 'P0001';
  end if;

  v_prefix := v_uid::text || '/' || p_post_id::text || '/';
  foreach v_path in array p_photo_paths loop
    if v_path is null
       or left(v_path, char_length(v_prefix)) <> v_prefix
       or substr(v_path, char_length(v_prefix) + 1) !~ '^[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
       or not exists (select 1 from storage.objects o
                       where o.bucket_id = 'community-photos' and o.name = v_path) then
      raise exception 'invalid_photos' using errcode = 'P0001';
    end if;
  end loop;

  begin
    insert into public.posts (id, user_id, caption) values (p_post_id, v_uid, v_caption);
  exception when unique_violation then
    raise exception 'invalid_post' using errcode = 'P0001';
  end;

  foreach v_path in array p_photo_paths loop
    v_count := v_count + 1;
    insert into public.post_photos (post_id, path, position) values (p_post_id, v_path, v_count);
  end loop;

  return p_post_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- edit_post_caption: the author changes the caption of a live post.
-- ---------------------------------------------------------------------------
create or replace function public.edit_post_caption(p_post_id uuid, p_caption text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_member();
  v_caption text := private.clean_caption(p_caption);
  p public.posts;
begin
  select * into p from public.posts
   where id = p_post_id and user_id = v_uid and deleted_at is null
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p.caption = v_caption then
    return p.edited_at;  -- nothing changed
  end if;

  update public.posts set caption = v_caption, edited_at = now() where id = p.id;
  return now();
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_post: the author or the owner soft-deletes a post. Returns the photo
-- paths so the app removes the files (the bucket is public). Calling it again
-- on a post already deleted returns the paths again, so a failed file removal
-- can be retried.
-- ---------------------------------------------------------------------------
create or replace function public.delete_post(p_post_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.posts;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found or (p.user_id <> v_uid and not private.is_owner()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p.deleted_at is null then
    update public.posts set deleted_at = now() where id = p.id;
  end if;

  return coalesce((select array_agg(ph.path order by ph.position)
                     from public.post_photos ph where ph.post_id = p.id), '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- comment_on_post
-- ---------------------------------------------------------------------------
create or replace function public.comment_on_post(p_post_id uuid, p_body text)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid  uuid := private.require_member();
  v_body text := private.clean_comment(p_body);
begin
  perform 1 from public.posts where id = p_post_id and deleted_at is null for share;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return query
    insert into public.comments (user_id, post_id, body)
    values (v_uid, p_post_id, v_body)
    returning id, created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_comment: the author or the owner soft-deletes a comment.
-- Works for comments on feedback too (Phase 6).
-- ---------------------------------------------------------------------------
create or replace function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.comments;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into c from public.comments where id = p_comment_id for update;
  if not found or (c.user_id <> v_uid and not private.is_owner()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if c.deleted_at is null then
    update public.comments set deleted_at = now() where id = c.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_post_reaction: like / haha (adds or switches), null removes.
-- Returns the post's new counts and the caller's reaction.
-- ---------------------------------------------------------------------------
create or replace function public.set_post_reaction(p_post_id uuid, p_type public.reaction_type)
returns table (like_count integer, haha_count integer, my_reaction public.reaction_type)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_member();
begin
  perform 1 from public.posts where id = p_post_id and deleted_at is null for share;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_type is null then
    delete from public.reactions where user_id = v_uid and post_id = p_post_id;
  else
    insert into public.reactions (user_id, post_id, type)
    values (v_uid, p_post_id, p_type)
    on conflict (user_id, post_id) where post_id is not null
    do update set type = excluded.type;
  end if;

  return query
    select
      (select count(*)::integer from public.reactions r where r.post_id = p_post_id and r.type = 'like'),
      (select count(*)::integer from public.reactions r where r.post_id = p_post_id and r.type = 'haha'),
      p_type;
end;
$$;

-- ---------------------------------------------------------------------------
-- Direct writes are closed: posts, post_photos, comments and reactions change
-- only through the functions above. Reads stay as they were (public, live rows;
-- the owner also sees deleted ones for moderation).
-- ---------------------------------------------------------------------------
revoke insert, update on public.posts from authenticated;
revoke insert, delete on public.post_photos from authenticated;
revoke insert, update on public.comments from authenticated;
revoke insert, update, delete on public.reactions from authenticated;

drop policy "posts: author creates with complete profile" on public.posts;
drop policy "posts: owner moderates" on public.posts;
drop policy "post_photos: author adds to own post" on public.post_photos;
drop policy "post_photos: owner deletes" on public.post_photos;
drop policy "comments: author creates with complete profile" on public.comments;
drop policy "comments: owner moderates" on public.comments;
drop policy "reactions: author creates with complete profile" on public.reactions;
drop policy "reactions: author switches own" on public.reactions;
drop policy "reactions: author removes own" on public.reactions;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.community_feed(timestamptz, uuid, integer) from public;
revoke all on function public.post_comments(uuid) from public;
revoke all on function public.create_post(uuid, text, text[]) from public, anon;
revoke all on function public.edit_post_caption(uuid, text) from public, anon;
revoke all on function public.delete_post(uuid) from public, anon;
revoke all on function public.comment_on_post(uuid, text) from public, anon;
revoke all on function public.delete_comment(uuid) from public, anon;
revoke all on function public.set_post_reaction(uuid, public.reaction_type) from public, anon;

grant execute on function public.community_feed(timestamptz, uuid, integer) to anon, authenticated, service_role;
grant execute on function public.post_comments(uuid) to anon, authenticated, service_role;
grant execute on function public.create_post(uuid, text, text[]) to authenticated, service_role;
grant execute on function public.edit_post_caption(uuid, text) to authenticated, service_role;
grant execute on function public.delete_post(uuid) to authenticated, service_role;
grant execute on function public.comment_on_post(uuid, text) to authenticated, service_role;
grant execute on function public.delete_comment(uuid) to authenticated, service_role;
grant execute on function public.set_post_reaction(uuid, public.reaction_type) to authenticated, service_role;
