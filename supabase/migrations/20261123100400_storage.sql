-- Phase 1 · storage buckets + policies
-- Spec: docs/SPEC.md §10 (storage buckets).
--
-- Path conventions (first folder is what policies check):
--   payment-proofs    <booking_id>/<file>
--   refund-proofs     <booking_id>/<file>
--   community-photos  <user_id>/<post_id>/<file>
--   feedback-photos   <user_id>/<feedback_id>/<file>
--   site-assets       gcash/<file>, ...
--
-- Payment proofs are uploaded only through server-issued signed upload URLs
-- (the server action checks the booking belongs to the caller — account or
-- guest device token — and is still pending_payment with a live hold).
-- Nothing in storage is ever writable by anonymous users.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-proofs',   'payment-proofs',   false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('refund-proofs',    'refund-proofs',    false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('community-photos', 'community-photos', true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('feedback-photos',  'feedback-photos',  true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('site-assets',      'site-assets',      true,  2097152, array['image/jpeg', 'image/png', 'image/webp'])  -- no SVG (scriptable)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- payment-proofs (private): read = owner + that booking's account holder.
-- Guests read their own proof through a server-generated signed URL.
-- ---------------------------------------------------------------------------
create policy "payment-proofs: owner or booking customer reads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (select public.is_owner())
      or exists (
        select 1 from public.bookings b
        where b.id::text = (storage.foldername(name))[1]
          and b.user_id = (select auth.uid())
      )
    )
  );

create policy "payment-proofs: owner deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'payment-proofs' and (select public.is_owner()));

-- ---------------------------------------------------------------------------
-- refund-proofs (private): read = owner + that booking's account holder; write = owner
-- ---------------------------------------------------------------------------
create policy "refund-proofs: owner or booking customer reads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'refund-proofs'
    and (
      (select public.is_owner())
      or exists (
        select 1 from public.bookings b
        where b.id::text = (storage.foldername(name))[1]
          and b.user_id = (select auth.uid())
      )
    )
  );

create policy "refund-proofs: owner uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'refund-proofs' and (select public.is_owner()));

create policy "refund-proofs: owner updates"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'refund-proofs' and (select public.is_owner()))
  with check (bucket_id = 'refund-proofs' and (select public.is_owner()));

create policy "refund-proofs: owner deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'refund-proofs' and (select public.is_owner()));

-- ---------------------------------------------------------------------------
-- community-photos / feedback-photos (public read via public URLs)
-- write = the author into their own folder; delete = author or owner
-- ---------------------------------------------------------------------------
create policy "community-photos: author or owner lists own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'community-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_owner()))
  );

create policy "community-photos: author uploads to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_complete_profile())
  );

create policy "community-photos: author or owner deletes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_owner()))
  );

create policy "feedback-photos: author or owner lists own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_owner()))
  );

create policy "feedback-photos: author uploads to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_complete_profile())
  );

create policy "feedback-photos: author or owner deletes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'feedback-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_owner()))
  );

-- ---------------------------------------------------------------------------
-- site-assets (public read; owner manages, e.g. the GCash QR)
-- ---------------------------------------------------------------------------
create policy "site-assets: owner lists"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'site-assets' and (select public.is_owner()));

create policy "site-assets: owner uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-assets' and (select public.is_owner()));

create policy "site-assets: owner updates"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-assets' and (select public.is_owner()))
  with check (bucket_id = 'site-assets' and (select public.is_owner()));

create policy "site-assets: owner deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-assets' and (select public.is_owner()));
