-- Phase 1 · advisor fixes
-- 1. Move the RLS helper functions out of the API-exposed `public` schema so
--    they can't be called through /rest/v1/rpc. Policies reference functions
--    by OID, so existing policies keep working after the move.
-- 2. One SELECT policy per table/role (bookings, refunds) instead of two
--    overlapping permissive ones; owner writes split per action.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_owner() set schema private;
alter function public.has_complete_profile() set schema private;
alter function public.handle_new_user() set schema private;

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
drop policy "bookings: read own" on public.bookings;
drop policy "bookings: owner full access" on public.bookings;

create policy "bookings: read own or owner"
  on public.bookings for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner()));

create policy "bookings: owner inserts"
  on public.bookings for insert
  to authenticated
  with check ((select private.is_owner()));

create policy "bookings: owner updates"
  on public.bookings for update
  to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy "bookings: owner deletes"
  on public.bookings for delete
  to authenticated
  using ((select private.is_owner()));

-- ---------------------------------------------------------------------------
-- refunds
-- ---------------------------------------------------------------------------
drop policy "refunds: read own" on public.refunds;
drop policy "refunds: owner full access" on public.refunds;

create policy "refunds: read own or owner"
  on public.refunds for select
  to authenticated
  using (
    (select private.is_owner())
    or exists (
      select 1 from public.bookings b
      where b.id = refunds.booking_id and b.user_id = (select auth.uid())
    )
  );

create policy "refunds: owner inserts"
  on public.refunds for insert
  to authenticated
  with check ((select private.is_owner()));

create policy "refunds: owner updates"
  on public.refunds for update
  to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy "refunds: owner deletes"
  on public.refunds for delete
  to authenticated
  using ((select private.is_owner()));
