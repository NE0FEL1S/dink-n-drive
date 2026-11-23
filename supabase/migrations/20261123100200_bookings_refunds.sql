-- Phase 1 · bookings + refunds
-- Spec: docs/SPEC.md §5 (booking flow), §6 (cancellation & refunds), §10.
-- Creation, limits, cutoffs and refunds run in security-definer functions
-- (Phases 2 and 4). This migration holds the table-level invariants that must
-- be true no matter who writes the row.

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                     uuid primary key default gen_random_uuid(),
  -- DND- + 5 chars from an alphabet without look-alikes (no 0, O, 1, I)
  ref_code               text not null unique check (ref_code ~ '^DND-[2-9A-HJ-NP-Z]{5}$'),
  kind                   public.booking_kind not null default 'customer',

  -- who: exactly one of user_id / guest_token_hash for customer bookings
  user_id                uuid references public.profiles (id) on delete cascade,
  guest_token_hash       text check (guest_token_hash is null or guest_token_hash ~ '^[0-9a-f]{64}$'), -- sha-256 hex
  contact_name           text check (contact_name is null or char_length(contact_name) between 1 and 100),
  contact_email          text check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  contact_phone          text check (contact_phone is null or contact_phone ~ '^\+639[0-9]{9}$'),

  -- when: whole hours on the hour
  start_at               timestamptz not null,
  end_at                 timestamptz not null,
  hours                  integer not null check (hours >= 1),

  -- money (whole pesos), copied from settings at creation
  paddle_rented          boolean not null default false,
  hourly_rate            integer not null default 0 check (hourly_rate >= 0),
  court_fee              integer not null default 0 check (court_fee >= 0),
  paddle_fee             integer not null default 0 check (paddle_fee >= 0),
  cancel_fee             integer not null default 0 check (cancel_fee >= 0),
  total                  integer not null default 0 check (total >= 0),

  -- lifecycle
  status                 public.booking_status not null default 'pending_payment',
  status_before_request  public.booking_status,
  hold_expires_at        timestamptz,             -- set while pending_payment
  payment_proof_path     text,                    -- object path in payment-proofs
  payment_submitted_at   timestamptz,
  reviewed_by            uuid references public.profiles (id) on delete set null,
  reviewed_at            timestamptz,
  reject_reason          text check (reject_reason is null or char_length(reject_reason) <= 500),
  cancelled_by           public.booking_actor,
  cancelled_at           timestamptz,
  block_note             text check (block_note is null or char_length(block_note) <= 200),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- time shape (Asia/Manila is UTC+8, so UTC hour boundaries are Manila hour boundaries)
  constraint bookings_start_on_hour check (extract(epoch from start_at) % 3600 = 0),
  constraint bookings_end_matches_hours check (end_at = start_at + make_interval(hours => hours)),

  -- kind <-> status
  constraint bookings_block_status check ((kind = 'block') = (status = 'blocked')),

  -- owner blocks: no customer, no money
  constraint bookings_block_shape check (
    kind <> 'block' or (
      user_id is null and guest_token_hash is null
      and contact_name is null and contact_email is null and contact_phone is null
      and not paddle_rented
      and hourly_rate = 0 and court_fee = 0 and paddle_fee = 0 and cancel_fee = 0 and total = 0
      and payment_proof_path is null and hold_expires_at is null
    )
  ),

  -- customer bookings: contact snapshot + exactly one owner (account or guest browser)
  constraint bookings_customer_shape check (
    kind <> 'customer' or (
      contact_name is not null and contact_email is not null and contact_phone is not null
      and num_nonnulls(user_id, guest_token_hash) = 1
      and block_note is null
    )
  ),

  -- money adds up
  constraint bookings_court_fee check (court_fee = hourly_rate * hours),
  constraint bookings_paddle_fee check (paddle_rented or paddle_fee = 0),
  constraint bookings_total check (total = court_fee + paddle_fee),

  -- an unpaid booking always has a hold deadline
  constraint bookings_hold check (status <> 'pending_payment' or hold_expires_at is not null),

  -- a cancellation request remembers where to go back to if declined
  constraint bookings_status_before_request check (
    status <> 'cancel_requested'
    or status_before_request in ('pending_review', 'confirmed')
  ),

  -- cancelled bookings record who cancelled
  constraint bookings_cancelled check (
    status <> 'cancelled' or (cancelled_by is not null and cancelled_at is not null)
  ),

  -- double-booking protection: active bookings and blocks never overlap
  constraint bookings_no_overlap exclude using gist (
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending_payment', 'pending_review', 'confirmed', 'cancel_requested', 'blocked'))
);

comment on table public.bookings is
  'Customer bookings and owner blocks. Contact details and proof paths are never public; availability is served by a function returning time ranges only.';
comment on column public.bookings.guest_token_hash is
  'sha-256 (hex) of the guest device token stored in an httpOnly cookie. Guests act only through security-definer functions.';

create index bookings_user_id_idx on public.bookings (user_id) where user_id is not null;
create index bookings_guest_token_hash_idx on public.bookings (guest_token_hash) where guest_token_hash is not null;
create index bookings_start_at_idx on public.bookings (start_at);
create index bookings_status_idx on public.bookings (status);
create index bookings_unpaid_phone_idx on public.bookings (contact_phone) where status = 'pending_payment';
create index bookings_hold_idx on public.bookings (hold_expires_at) where status = 'pending_payment';

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- refunds
-- ---------------------------------------------------------------------------
create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings (id) on delete cascade,
  requested_at       timestamptz not null default now(),
  cancel_fee         integer not null check (cancel_fee >= 0),   -- 0 for owner cancellations
  refund_amount      integer not null check (refund_amount >= 0),
  gcash_name         text check (gcash_name is null or char_length(gcash_name) between 1 and 100),
  gcash_number       text check (gcash_number is null or gcash_number ~ '^\+639[0-9]{9}$'),
  status             public.refund_status not null default 'requested',
  decline_reason     text check (decline_reason is null or char_length(decline_reason) <= 500),
  decided_by         uuid references public.profiles (id) on delete set null,
  decided_at         timestamptz,
  refund_proof_path  text,  -- object path in refund-proofs
  completed_by       uuid references public.profiles (id) on delete set null,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- the GCash number is erased once the refund is completed
  constraint refunds_number_erased check (status <> 'completed' or gcash_number is null),
  constraint refunds_completed check (status <> 'completed' or completed_at is not null),
  constraint refunds_declined check (status <> 'declined' or decided_at is not null)
);

comment on table public.refunds is 'Cancellation requests and refunds. GCash details are visible only to the owner and that customer.';

-- at most one live (non-declined) refund per booking; a declined request can be followed by a new one
create unique index refunds_one_live_per_booking on public.refunds (booking_id) where status <> 'declined';
create index refunds_booking_id_idx on public.refunds (booking_id);
create index refunds_status_idx on public.refunds (status);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- Guests are anonymous to Supabase: they get nothing here. Their actions go
-- through server actions + security-definer functions that check the device
-- token hash (Phase 2). Customers only read their own rows; every write by a
-- customer goes through a function. The owner can do everything.
-- ---------------------------------------------------------------------------
revoke all on public.bookings from anon, authenticated;
revoke all on public.refunds from anon, authenticated;
grant select, insert, update, delete on public.bookings to authenticated;  -- RLS limits writes to the owner
grant select, insert, update, delete on public.refunds to authenticated;   -- RLS limits writes to the owner
grant all on public.bookings to service_role;
grant all on public.refunds to service_role;

alter table public.bookings enable row level security;
alter table public.refunds enable row level security;

create policy "bookings: read own"
  on public.bookings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "bookings: owner full access"
  on public.bookings for all
  to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create policy "refunds: read own"
  on public.refunds for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = refunds.booking_id and b.user_id = (select auth.uid())
    )
  );

create policy "refunds: owner full access"
  on public.refunds for all
  to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
