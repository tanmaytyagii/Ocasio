-- Ocasio — initial schema
--
-- Establishes the persistent foundation: profiles with database-backed roles,
-- vendors and their services/media, and customer favourites.
--
-- Deliberately NOT created yet (Phases 3-4): bookings, booking_status_history,
-- conversations, messages, reviews, payments, notifications. Foreign-key targets
-- here are shaped so those attach without restructuring.
--
-- RLS policies live in the next migration. Every table created here is left with
-- RLS ENABLED and zero policies, which denies all access by default — a table can
-- never be reachable between these two migrations.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive slugs/emails
create extension if not exists "pg_trgm";    -- trigram search, used from Phase 2

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Authorization role. 'admin' is defined so the type does not need altering
-- later, but no admin functionality is exposed in Phase 1.
create type public.user_role as enum ('customer', 'vendor', 'admin');

-- Vendor lifecycle. Signup cannot mint an 'active' vendor; see the
-- request_vendor_onboarding() function in the RLS migration.
create type public.vendor_status as enum ('pending', 'active', 'suspended');

-- ---------------------------------------------------------------------------
-- updated_at maintenance
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

comment on function public.set_updated_at is
  'Trigger helper: stamps updated_at on UPDATE. search_path pinned to empty to prevent schema-resolution hijacking.';

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users row; the authorization source of truth
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 120)
);

comment on table public.profiles is
  'Application profile per auth user. profiles.role is the ONLY authorization source. auth.users.raw_user_meta_data is user-writable via supabase.auth.updateUser() and must never be trusted for authorization.';
comment on column public.profiles.role is
  'Authorization role. Users cannot change this themselves — enforced by the profiles_no_self_role_change trigger plus a column-restricted RLS update policy.';

create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------

create table public.vendors (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  business_name   text not null,
  slug            citext not null unique,
  description     text,
  category        text not null,
  location        text not null,
  status          public.vendor_status not null default 'pending',

  -- Contact details shown on the public profile.
  phone           text,
  email           text,
  website         text,
  business_hours  text,
  hero_image_url  text,

  -- Denormalised review aggregates. Phase 4 maintains these from a trigger on
  -- reviews; until then they hold seeded demo values and are NOT user-writable.
  rating          numeric(2,1) not null default 0,
  review_count    integer not null default 0,

  -- Integer rupees. Never floating point for money.
  starting_price  integer,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint vendors_slug_format      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint vendors_rating_range     check (rating >= 0 and rating <= 5),
  constraint vendors_review_count_pos check (review_count >= 0),
  constraint vendors_price_pos        check (starting_price is null or starting_price >= 0),
  constraint vendors_name_length      check (char_length(business_name) between 2 and 160),

  -- One vendor business per owner in Phase 1. Relaxable later if multi-brand
  -- owners become a requirement.
  constraint vendors_one_per_owner    unique (owner_id)
);

comment on table public.vendors is
  'Vendor businesses. Only status = ''active'' rows are publicly readable. Seeded rows are DEMO data, marked by profiles.full_name = ''Ocasio Demo Vendor''.';
comment on column public.vendors.slug is
  'Stable, unique, URL-safe public identifier. Vendor pages resolve by slug, never by array index or generated string.';

create index vendors_owner_id_idx  on public.vendors (owner_id);
create index vendors_category_idx  on public.vendors (category) where status = 'active';
create index vendors_location_idx  on public.vendors (location) where status = 'active';
create index vendors_status_idx    on public.vendors (status);
create index vendors_rating_idx    on public.vendors (rating desc) where status = 'active';
-- Trigram index for Phase 2 fuzzy search; harmless now.
create index vendors_name_trgm_idx on public.vendors using gin (business_name gin_trgm_ops);

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vendor_services
-- ---------------------------------------------------------------------------

create table public.vendor_services (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  name        text not null,
  description text,
  price       integer,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint vendor_services_price_pos   check (price is null or price >= 0),
  constraint vendor_services_name_length check (char_length(name) between 1 and 160)
);

comment on table public.vendor_services is
  'Services a vendor offers. price is integer rupees. From Phase 3, booking prices are derived from this table server-side and never from the client.';

create index vendor_services_vendor_id_idx on public.vendor_services (vendor_id);

create trigger vendor_services_set_updated_at
  before update on public.vendor_services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vendor_media
-- ---------------------------------------------------------------------------

create table public.vendor_media (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendors (id) on delete cascade,
  url        text not null,
  alt_text   text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint vendor_media_url_not_blank check (char_length(trim(url)) > 0)
);

comment on table public.vendor_media is
  'Portfolio images. Phase 1 stores external URLs only — Supabase Storage upload infrastructure is deliberately deferred until vendors can actually upload.';

create index vendor_media_vendor_id_idx on public.vendor_media (vendor_id, sort_order);

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------

create table public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  vendor_id  uuid not null references public.vendors (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint favorites_unique_pair unique (user_id, vendor_id)
);

comment on table public.favorites is
  'Customer shortlist. The unique constraint makes double-favouriting impossible at the database level rather than relying on UI state.';

create index favorites_user_id_idx   on public.favorites (user_id);
create index favorites_vendor_id_idx on public.favorites (vendor_id);

-- ---------------------------------------------------------------------------
-- RLS on, no policies yet => deny-all until the policy migration runs.
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.vendors         enable row level security;
alter table public.vendor_services enable row level security;
alter table public.vendor_media    enable row level security;
alter table public.favorites       enable row level security;
