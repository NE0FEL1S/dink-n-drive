-- Phase 1 · Extensions, shared helpers, enums and profiles
-- Spec: docs/SPEC.md §3 (auth & roles) and §10 (data model)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- btree_gist: lets GiST exclusion constraints mix scalar equality with range
-- overlap (kept for a future second court; the booking overlap rule needs gist).
create extension if not exists btree_gist with schema extensions;
-- pg_cron: expires unpaid holds every minute (job added in Phase 2).
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'owner');

create type public.booking_kind as enum ('customer', 'block');

create type public.booking_status as enum (
  'pending_payment',
  'pending_review',
  'confirmed',
  'rejected',
  'expired',
  'cancelled',
  'cancel_requested',
  'blocked'
);

create type public.booking_actor as enum ('customer', 'owner');

create type public.refund_status as enum ('requested', 'approved', 'declined', 'completed');

create type public.feedback_status as enum ('open', 'in_progress', 'resolved');

create type public.reaction_type as enum ('like', 'haha');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or char_length(full_name) between 1 and 100),
  -- PH mobile, entered as 09XXXXXXXXX and stored as +639XXXXXXXXX
  phone       text check (phone is null or phone ~ '^\+639[0-9]{9}$'),
  email       text,
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Phone and email are never public.';

create index profiles_phone_idx on public.profiles (phone);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile when a user signs up; prefill the name from Google
-- (full_name / name) or from the email sign-up form (full_name).
-- Must never fail, or the sign-up itself fails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(
      nullif(
        btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')),
        ''
      ),
      100
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'owner'
  );
$$;

-- Signed in with full name and phone: required to post, comment, react, give feedback.
create or replace function public.has_complete_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and full_name is not null
      and phone is not null
  );
$$;

revoke execute on function public.is_owner() from public;
revoke execute on function public.has_complete_profile() from public;
grant execute on function public.is_owner() to anon, authenticated, service_role;
grant execute on function public.has_complete_profile() to anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: privileges + RLS
-- Customers may only change their own full_name and phone (never role/email).
-- The first owner is set by hand in the SQL editor (docs/SETUP.md Part 5b).
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "profiles: read own or owner"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_owner()));

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
