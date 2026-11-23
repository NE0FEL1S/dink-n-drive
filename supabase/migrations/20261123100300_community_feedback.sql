-- Phase 1 · community posts, public feedback, comments, reactions
-- Spec: docs/SPEC.md §7, §8, §10.
-- Tables and base RLS only. Rate limits, the public author views and the
-- anonymous-feedback view come in Phases 5–6.

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  caption     text not null default '' check (char_length(caption) <= 2000),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index posts_feed_idx on public.posts (created_at desc) where deleted_at is null;
create index posts_user_id_idx on public.posts (user_id);

create table public.post_photos (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  path        text not null unique,  -- object path in community-photos
  position    smallint not null check (position in (1, 2)),
  created_at  timestamptz not null default now(),
  unique (post_id, position)
);

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
create table public.feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  is_anonymous  boolean not null default false,
  message       text not null check (char_length(btrim(message)) between 1 and 2000),
  status        public.feedback_status not null default 'open',
  owner_reply   text check (owner_reply is null or char_length(owner_reply) <= 2000),
  replied_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index feedback_feed_idx on public.feedback (created_at desc) where deleted_at is null;
create index feedback_user_id_idx on public.feedback (user_id);

create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

create table public.feedback_photos (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references public.feedback (id) on delete cascade,
  path         text not null unique,  -- object path in feedback-photos
  position     smallint not null check (position in (1, 2)),
  created_at   timestamptz not null default now(),
  unique (feedback_id, position)
);

-- ---------------------------------------------------------------------------
-- comments (on a post or a feedback item, never both)
-- ---------------------------------------------------------------------------
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  post_id      uuid references public.posts (id) on delete cascade,
  feedback_id  uuid references public.feedback (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint comments_one_target check (num_nonnulls(post_id, feedback_id) = 1)
);

create index comments_post_idx on public.comments (post_id, created_at) where post_id is not null;
create index comments_feedback_idx on public.comments (feedback_id, created_at) where feedback_id is not null;
create index comments_user_rate_idx on public.comments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- reactions (one per user per target; can switch or remove)
-- ---------------------------------------------------------------------------
create table public.reactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  post_id      uuid references public.posts (id) on delete cascade,
  feedback_id  uuid references public.feedback (id) on delete cascade,
  type         public.reaction_type not null,
  created_at   timestamptz not null default now(),
  constraint reactions_one_target check (num_nonnulls(post_id, feedback_id) = 1)
);

create unique index reactions_user_post_key on public.reactions (user_id, post_id) where post_id is not null;
create unique index reactions_user_feedback_key on public.reactions (user_id, feedback_id) where feedback_id is not null;
create index reactions_post_idx on public.reactions (post_id) where post_id is not null;
create index reactions_feedback_idx on public.reactions (feedback_id) where feedback_id is not null;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.posts, public.post_photos, public.feedback, public.feedback_photos,
              public.comments, public.reactions from anon, authenticated;

-- public read (non-sensitive columns only: ids, captions, bodies, timestamps)
grant select on public.posts, public.post_photos, public.comments, public.reactions to anon, authenticated;
-- feedback holds the real author of anonymous items: no direct public read.
-- The public feed reads it through a view that hides anonymous authors (Phase 6).
grant select on public.feedback, public.feedback_photos to authenticated;

grant insert, update on public.posts, public.feedback, public.comments to authenticated;
grant insert, delete on public.post_photos, public.feedback_photos to authenticated;
grant insert, delete on public.reactions to authenticated;
grant update (type) on public.reactions to authenticated;  -- switch like/haha, never the target

grant all on public.posts, public.post_photos, public.feedback, public.feedback_photos,
             public.comments, public.reactions to service_role;

alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
alter table public.feedback enable row level security;
alter table public.feedback_photos enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create policy "posts: public read live"
  on public.posts for select
  to anon, authenticated
  using (deleted_at is null or (select public.is_owner()));

create policy "posts: author creates with complete profile"
  on public.posts for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and deleted_at is null
    and (select public.has_complete_profile())
  );

create policy "posts: owner moderates"
  on public.posts for update
  to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ---------------------------------------------------------------------------
-- post_photos
-- ---------------------------------------------------------------------------
create policy "post_photos: public read for live posts"
  on public.post_photos for select
  to anon, authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_photos.post_id)  -- posts RLS hides deleted ones
  );

create policy "post_photos: author adds to own post"
  on public.post_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_photos.post_id
        and p.user_id = (select auth.uid())
        and p.deleted_at is null
    )
  );

create policy "post_photos: owner deletes"
  on public.post_photos for delete
  to authenticated
  using ((select public.is_owner()));

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
create policy "feedback: author or owner reads"
  on public.feedback for select
  to authenticated
  using (
    (user_id = (select auth.uid()) and deleted_at is null)
    or (select public.is_owner())
  );

create policy "feedback: author creates with complete profile"
  on public.feedback for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and deleted_at is null
    and status = 'open'
    and owner_reply is null
    and replied_at is null
    and (select public.has_complete_profile())
  );

create policy "feedback: owner updates (status, reply, delete)"
  on public.feedback for update
  to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ---------------------------------------------------------------------------
-- feedback_photos
-- ---------------------------------------------------------------------------
create policy "feedback_photos: read with visible feedback"
  on public.feedback_photos for select
  to authenticated
  using (
    exists (select 1 from public.feedback f where f.id = feedback_photos.feedback_id)  -- feedback RLS applies
  );

create policy "feedback_photos: author adds to own feedback"
  on public.feedback_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.feedback f
      where f.id = feedback_photos.feedback_id
        and f.user_id = (select auth.uid())
        and f.deleted_at is null
    )
  );

create policy "feedback_photos: owner deletes"
  on public.feedback_photos for delete
  to authenticated
  using ((select public.is_owner()));

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create policy "comments: public read live"
  on public.comments for select
  to anon, authenticated
  using (deleted_at is null or (select public.is_owner()));

create policy "comments: author creates with complete profile"
  on public.comments for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and deleted_at is null
    and (select public.has_complete_profile())
  );

create policy "comments: owner moderates"
  on public.comments for update
  to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ---------------------------------------------------------------------------
-- reactions
-- ---------------------------------------------------------------------------
create policy "reactions: public read"
  on public.reactions for select
  to anon, authenticated
  using (true);

create policy "reactions: author creates with complete profile"
  on public.reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.has_complete_profile())
  );

create policy "reactions: author switches own"
  on public.reactions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reactions: author removes own"
  on public.reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));
