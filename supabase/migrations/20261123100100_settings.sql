-- Phase 1 · settings (single row)
-- Every price, hour, hold time, cutoff, fee and limit lives here so the owner
-- can change them without code. Bookings copy the rates they were made with.

create table public.settings (
  id                   boolean primary key default true check (id),
  court_name           text not null default 'Dink n'' Drive'
                         check (char_length(court_name) between 1 and 80),
  hourly_rate          integer not null default 250 check (hourly_rate >= 0),
  paddle_fee           integer not null default 50  check (paddle_fee >= 0),
  paddle_count         integer not null default 4   check (paddle_count >= 0),  -- display only
  open_hour            integer not null default 8   check (open_hour between 0 and 23),
  close_hour           integer not null default 24  check (close_hour between 1 and 24), -- 24 = midnight
  hold_minutes         integer not null default 15  check (hold_minutes between 1 and 240),
  cancel_cutoff_hours  integer not null default 3   check (cancel_cutoff_hours between 0 and 168),
  cancel_fee           integer not null default 100 check (cancel_fee >= 0),
  max_advance_days     integer not null default 30  check (max_advance_days between 1 and 365),
  max_unpaid_bookings  integer not null default 2   check (max_unpaid_bookings between 1 and 20),
  gcash_qr_path        text,  -- object path in the site-assets bucket
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles (id) on delete set null,
  constraint settings_hours_order check (open_hour < close_hour)
);

comment on table public.settings is 'Single row of business settings (id is always true).';

insert into public.settings default values;

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

revoke all on public.settings from anon, authenticated;
grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;  -- RLS: owner only
grant all on public.settings to service_role;

alter table public.settings enable row level security;

create policy "settings: anyone can read"
  on public.settings for select
  to anon, authenticated
  using (true);

create policy "settings: owner can update"
  on public.settings for update
  to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
