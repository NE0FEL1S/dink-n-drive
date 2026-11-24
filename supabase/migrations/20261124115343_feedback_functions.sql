-- Phase 6 · public feedback functions
-- Spec: docs/SPEC.md §8 (feedback page), §10 (data model).
--
--   feedback_feed(status, before, before_id, limit)   anyone       page of live feedback, newest first
--   feedback_comments(feedback)                       anyone       live comments, oldest first
--   create_feedback(id, message, anonymous, paths)    member       0–2 photos already uploaded
--   delete_feedback(feedback)                         author/owner soft delete → photo paths to remove
--   comment_on_feedback(feedback, body)               member
--   set_feedback_reaction(feedback, type | null)      member       like / haha / remove → new counts
--   admin_set_feedback_status(feedback, status)       owner        open / in_progress / resolved
--   admin_reply_feedback(feedback, reply)             owner        public reply; empty clears it
--
-- delete_comment (Phase 5) already handles comments on feedback.
-- The owner's inbox reads public.feedback directly (owner RLS shows every row
-- and the real author), like the Moderation tab does for posts.
--
-- Decisions (developer, 2026-11-24): the author can delete their own feedback
-- but never edit it, so the owner's reply always answers what was written.
--
-- Anonymous feedback: the feed returns author_name = null — never a name, id
-- or path that leads to the account. To keep that true:
--   * photo paths no longer start with the user id. New convention:
--     feedback-photos/<feedback_id>/<name>.<ext>; storage.objects.owner_id
--     (set by Storage from the uploader's JWT) proves who uploaded a file.
--   * comments and reactions on feedback are no longer readable from the
--     tables (they carry user_id); everyone reads them through the functions.
--   As the spec notes, a comment the author writes on their own anonymous
--   feedback shows their name.
--
-- Rate limit (trigger): 5 feedback items per 24 hours per user; deleted items
-- count. Comments share the existing 30-per-hour limit.

-- ---------------------------------------------------------------------------
-- private helpers
-- ---------------------------------------------------------------------------

-- Feedback message / owner reply: trimmed, at most 2000 characters.
create or replace function private.clean_feedback_text(p_text text, p_allow_empty boolean, p_error text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := coalesce(btrim(p_text), '');
begin
  if char_length(v) > 2000 or (char_length(v) = 0 and not p_allow_empty) then
    raise exception '%', p_error using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- (private.require_owner comes from the Phase 3 admin migration.)

create or replace function private.limit_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || new.user_id::text, 0));
  if (select count(*) from public.feedback
       where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = '5';
  end if;
  return new;
end;
$$;

revoke all on function private.clean_feedback_text(text, boolean, text) from public, anon, authenticated;
revoke all on function private.limit_feedback() from public, anon, authenticated;

create trigger feedback_rate_limit
  before insert on public.feedback
  for each row execute function private.limit_feedback();

-- ---------------------------------------------------------------------------
-- feedback_feed: live feedback, newest first, optional status filter,
-- keyset paging on (created_at, id). Anonymous items have no author_name.
-- ---------------------------------------------------------------------------
create or replace function public.feedback_feed(
  p_status    public.feedback_status default null,
  p_before    timestamptz default null,
  p_before_id uuid default null,
  p_limit     integer default 10
)
returns table (
  id            uuid,
  author_name   text,
  is_anonymous  boolean,
  message       text,
  status        public.feedback_status,
  owner_reply   text,
  replied_at    timestamptz,
  created_at    timestamptz,
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
    f.id,
    case when f.is_anonymous then null else coalesce(pr.full_name, 'Member') end,
    f.is_anonymous,
    f.message,
    f.status,
    f.owner_reply,
    f.replied_at,
    f.created_at,
    coalesce((select array_agg(ph.path order by ph.position)
                from public.feedback_photos ph where ph.feedback_id = f.id), '{}'),
    (select count(*)::integer from public.reactions r where r.feedback_id = f.id and r.type = 'like'),
    (select count(*)::integer from public.reactions r where r.feedback_id = f.id and r.type = 'haha'),
    (select count(*)::integer from public.comments c where c.feedback_id = f.id and c.deleted_at is null),
    (select r.type from public.reactions r where r.feedback_id = f.id and r.user_id = auth.uid()),
    f.user_id is not distinct from auth.uid()
  from public.feedback f
  left join public.profiles pr on pr.id = f.user_id
  where f.deleted_at is null
    and (p_status is null or f.status = p_status)
    and (p_before is null
         or (f.created_at, f.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by f.created_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

-- ---------------------------------------------------------------------------
-- feedback_comments: live comments on live feedback, oldest first (≤ 500).
-- ---------------------------------------------------------------------------
create or replace function public.feedback_comments(p_feedback_id uuid)
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
  join public.feedback f on f.id = c.feedback_id and f.deleted_at is null
  left join public.profiles pr on pr.id = c.user_id
  where c.feedback_id = p_feedback_id
    and c.deleted_at is null
  order by c.created_at, c.id
  limit 500;
$$;

-- ---------------------------------------------------------------------------
-- create_feedback: 0–2 photos, already uploaded by the caller to
-- feedback-photos/<feedback id>/<name>.<jpg|jpeg|png|webp>.
-- ---------------------------------------------------------------------------
create or replace function public.create_feedback(
  p_feedback_id  uuid,
  p_message      text,
  p_is_anonymous boolean,
  p_photo_paths  text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_member();
  v_message text := private.clean_feedback_text(p_message, false, 'invalid_message');
  v_paths   text[] := coalesce(p_photo_paths, '{}');
  v_prefix  text;
  v_path    text;
  v_count   integer := 0;
begin
  if p_feedback_id is null then
    raise exception 'invalid_feedback' using errcode = 'P0001';
  end if;
  if coalesce(array_ndims(v_paths), 1) <> 1
     or cardinality(v_paths) > 2
     or cardinality(v_paths) <> (select count(distinct x) from unnest(v_paths) x) then
    raise exception 'invalid_photos' using errcode = 'P0001';
  end if;

  v_prefix := p_feedback_id::text || '/';
  foreach v_path in array v_paths loop
    if v_path is null
       or left(v_path, char_length(v_prefix)) <> v_prefix
       or substr(v_path, char_length(v_prefix) + 1) !~ '^[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
       or not exists (select 1 from storage.objects o
                       where o.bucket_id = 'feedback-photos'
                         and o.name = v_path
                         and o.owner_id = v_uid::text) then
      raise exception 'invalid_photos' using errcode = 'P0001';
    end if;
  end loop;

  begin
    insert into public.feedback (id, user_id, is_anonymous, message)
    values (p_feedback_id, v_uid, coalesce(p_is_anonymous, false), v_message);
  exception when unique_violation then
    raise exception 'invalid_feedback' using errcode = 'P0001';
  end;

  foreach v_path in array v_paths loop
    v_count := v_count + 1;
    insert into public.feedback_photos (feedback_id, path, position) values (p_feedback_id, v_path, v_count);
  end loop;

  return p_feedback_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_feedback: the author or the owner soft-deletes feedback. Returns the
-- photo paths so the app removes the files (public bucket). Calling it again
-- returns the paths again, so a failed file removal can be retried.
-- ---------------------------------------------------------------------------
create or replace function public.delete_feedback(p_feedback_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  f public.feedback;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into f from public.feedback where id = p_feedback_id for update;
  if not found or (f.user_id <> v_uid and not private.is_owner()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if f.deleted_at is null then
    update public.feedback set deleted_at = now() where id = f.id;
  end if;

  return coalesce((select array_agg(ph.path order by ph.position)
                     from public.feedback_photos ph where ph.feedback_id = f.id), '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- comment_on_feedback
-- ---------------------------------------------------------------------------
create or replace function public.comment_on_feedback(p_feedback_id uuid, p_body text)
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
  perform 1 from public.feedback where id = p_feedback_id and deleted_at is null for share;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return query
    insert into public.comments (user_id, feedback_id, body)
    values (v_uid, p_feedback_id, v_body)
    returning id, created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_feedback_reaction: like / haha (adds or switches), null removes.
-- ---------------------------------------------------------------------------
create or replace function public.set_feedback_reaction(p_feedback_id uuid, p_type public.reaction_type)
returns table (like_count integer, haha_count integer, my_reaction public.reaction_type)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_member();
begin
  perform 1 from public.feedback where id = p_feedback_id and deleted_at is null for share;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_type is null then
    delete from public.reactions where user_id = v_uid and feedback_id = p_feedback_id;
  else
    insert into public.reactions (user_id, feedback_id, type)
    values (v_uid, p_feedback_id, p_type)
    on conflict (user_id, feedback_id) where feedback_id is not null
    do update set type = excluded.type;
  end if;

  return query
    select
      (select count(*)::integer from public.reactions r where r.feedback_id = p_feedback_id and r.type = 'like'),
      (select count(*)::integer from public.reactions r where r.feedback_id = p_feedback_id and r.type = 'haha'),
      p_type;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_feedback_status (owner)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_feedback_status(p_feedback_id uuid, p_status public.feedback_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner();
begin
  if p_status is null then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.feedback set status = p_status
   where id = p_feedback_id and deleted_at is null and status is distinct from p_status;
  if not found and not exists (select 1 from public.feedback
                                where id = p_feedback_id and deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_reply_feedback (owner): sets, edits or (empty text) clears the public
-- reply. Returns replied_at (null once cleared). An unchanged reply keeps its
-- original time.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reply_feedback(p_feedback_id uuid, p_reply text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_owner();
  v_reply text := nullif(private.clean_feedback_text(p_reply, true, 'invalid_reply'), '');
  f public.feedback;
begin
  select * into f from public.feedback
   where id = p_feedback_id and deleted_at is null
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if f.owner_reply is not distinct from v_reply then
    return f.replied_at;
  end if;

  update public.feedback
     set owner_reply = v_reply,
         replied_at  = case when v_reply is null then null else now() end
   where id = f.id;
  return case when v_reply is null then null else now() end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Direct writes are closed: feedback and feedback_photos change only through
-- the functions above. The author still reads their own live rows and the
-- owner reads everything (unchanged policies).
-- ---------------------------------------------------------------------------
revoke insert, update on public.feedback from authenticated;
revoke insert, delete on public.feedback_photos from authenticated;

drop policy "feedback: author creates with complete profile" on public.feedback;
drop policy "feedback: owner updates (status, reply, delete)" on public.feedback;
drop policy "feedback_photos: author adds to own feedback" on public.feedback_photos;
drop policy "feedback_photos: owner deletes" on public.feedback_photos;

-- Comments and reactions on feedback carry user_id: table reads now cover
-- posts only (plus the owner, for moderation). Feedback ones go through
-- feedback_feed / feedback_comments.
drop policy "comments: public read live" on public.comments;
create policy "comments: public read live post comments"
  on public.comments for select
  to anon, authenticated
  using ((post_id is not null and deleted_at is null) or (select private.is_owner()));

drop policy "reactions: public read" on public.reactions;
create policy "reactions: public read post reactions"
  on public.reactions for select
  to anon, authenticated
  using (post_id is not null or (select private.is_owner()));

-- ---------------------------------------------------------------------------
-- Storage: feedback-photos/<feedback_id>/<file>, uploader proven by owner_id.
-- ---------------------------------------------------------------------------
drop policy "feedback-photos: author or owner lists own" on storage.objects;
drop policy "feedback-photos: author uploads to own folder" on storage.objects;
drop policy "feedback-photos: author or owner deletes" on storage.objects;

create policy "feedback-photos: uploader or owner lists"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback-photos'
    and (owner_id = (select auth.uid())::text or (select private.is_owner()))
  );

create policy "feedback-photos: member uploads to a feedback folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback-photos'
    and owner_id = (select auth.uid())::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
    and (select private.has_complete_profile())
  );

create policy "feedback-photos: uploader or owner deletes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'feedback-photos'
    and (owner_id = (select auth.uid())::text or (select private.is_owner()))
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.feedback_feed(public.feedback_status, timestamptz, uuid, integer) from public;
revoke all on function public.feedback_comments(uuid) from public;
revoke all on function public.create_feedback(uuid, text, boolean, text[]) from public, anon;
revoke all on function public.delete_feedback(uuid) from public, anon;
revoke all on function public.comment_on_feedback(uuid, text) from public, anon;
revoke all on function public.set_feedback_reaction(uuid, public.reaction_type) from public, anon;
revoke all on function public.admin_set_feedback_status(uuid, public.feedback_status) from public, anon;
revoke all on function public.admin_reply_feedback(uuid, text) from public, anon;

grant execute on function public.feedback_feed(public.feedback_status, timestamptz, uuid, integer) to anon, authenticated, service_role;
grant execute on function public.feedback_comments(uuid) to anon, authenticated, service_role;
grant execute on function public.create_feedback(uuid, text, boolean, text[]) to authenticated, service_role;
grant execute on function public.delete_feedback(uuid) to authenticated, service_role;
grant execute on function public.comment_on_feedback(uuid, text) to authenticated, service_role;
grant execute on function public.set_feedback_reaction(uuid, public.reaction_type) to authenticated, service_role;
grant execute on function public.admin_set_feedback_status(uuid, public.feedback_status) to authenticated, service_role;
grant execute on function public.admin_reply_feedback(uuid, text) to authenticated, service_role;
