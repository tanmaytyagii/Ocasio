-- Ocasio — booking lifecycle
--
-- Phase 3. Turns the placeholder booking UI into persisted, server-authorised
-- state.
--
-- Design rule: the client supplies intent, never facts. It names a service, a
-- date, a location and some notes. Everything that matters for authorisation or
-- money — customer_id, vendor_id, quoted_price, status — is derived inside the
-- database. There are no INSERT or UPDATE policies on bookings at all, so the
-- only write path is through the functions below.

-- ---------------------------------------------------------------------------
-- Service availability
-- ---------------------------------------------------------------------------

-- vendor_services had no availability flag, so "the service must be bookable"
-- had nothing to check. Defaults to true so every existing row stays bookable.
alter table public.vendor_services
  add column is_active boolean not null default true;

comment on column public.vendor_services.is_active is
  'Whether the service can receive new bookings. Existing bookings are unaffected when this is turned off.';

create index vendor_services_active_idx
  on public.vendor_services (vendor_id) where is_active;

-- ---------------------------------------------------------------------------
-- Status enum
-- ---------------------------------------------------------------------------

create type public.booking_status as enum (
  'pending',    -- requested by the customer, awaiting the vendor
  'accepted',   -- vendor agreed; NOT paid, and not a payment state
  'declined',   -- vendor refused (terminal)
  'cancelled',  -- called off by either side (terminal)
  'completed'   -- the event happened (terminal)
);

comment on type public.booking_status is
  'Booking lifecycle. accepted means the vendor agreed to the work; it says nothing about payment, which does not exist yet.';

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id                uuid primary key default gen_random_uuid(),

  customer_id       uuid not null references public.profiles (id) on delete cascade,
  -- Denormalised from the service so vendor-scoped reads and policies do not
  -- need a join. create_booking() derives it; a trigger forbids changing it.
  vendor_id         uuid not null references public.vendors (id) on delete cascade,
  -- restrict: a service with booking history must not silently disappear and
  -- leave a booking pointing at nothing. Deactivate it with is_active instead.
  vendor_service_id uuid not null references public.vendor_services (id) on delete restrict,

  event_date        date not null,
  event_location    text not null,
  customer_notes    text,

  -- Integer rupees, computed server-side. Informational in Phase 3: no money
  -- moves, and nothing here is a payment record.
  quoted_price      integer not null,

  status            public.booking_status not null default 'pending',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint bookings_location_not_blank check (char_length(trim(event_location)) > 0),
  constraint bookings_notes_length       check (customer_notes is null or char_length(customer_notes) <= 2000),
  constraint bookings_price_non_negative check (quoted_price >= 0)
  -- Self-booking is rejected in create_booking() rather than by a constraint:
  -- the check needs vendors.owner_id, which a CHECK cannot reach.
);

comment on table public.bookings is
  'Customer booking requests. Written only through create_booking() and transition_booking_status(); there are deliberately no INSERT or UPDATE policies.';
comment on column public.bookings.quoted_price is
  'Integer rupees, derived server-side from the service price, falling back to the vendor starting price. Informational only — Phase 3 has no payments.';

create index bookings_customer_idx        on public.bookings (customer_id, created_at desc);
create index bookings_vendor_status_idx   on public.bookings (vendor_id, status, created_at desc);
create index bookings_service_idx         on public.bookings (vendor_service_id);
create index bookings_event_date_idx      on public.bookings (event_date);

-- Guards against a double-submitted form or an impatient double click. Scoped
-- to live bookings only, so a customer may rebook the same service and date
-- after cancelling or being declined.
create unique index bookings_no_duplicate_live_request
  on public.bookings (customer_id, vendor_service_id, event_date)
  where status in ('pending', 'accepted');

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- booking_status_history
-- ---------------------------------------------------------------------------

create table public.booking_status_history (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  -- null on the first row: the booking did not exist before it was requested.
  from_status public.booking_status,
  to_status   public.booking_status not null,
  -- set null rather than cascade: deleting an account must not erase the
  -- record that a transition happened.
  changed_by  uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),

  constraint booking_history_note_length check (note is null or char_length(note) <= 500),
  constraint booking_history_real_change check (from_status is distinct from to_status)
);

comment on table public.booking_status_history is
  'Append-only audit of every status change. Readable by the two parties to the booking; there are no INSERT, UPDATE or DELETE policies, so only the SECURITY DEFINER transition functions can write it.';

create index booking_status_history_booking_idx
  on public.booking_status_history (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Field protection
-- ---------------------------------------------------------------------------

-- Belt and braces. There is no UPDATE policy on bookings, so a client cannot
-- reach this trigger today. It exists so that adding one later cannot silently
-- open a hole, and so service_role tooling cannot rewrite a booking's identity
-- or price by accident.
create or replace function public.protect_booking_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id       is distinct from old.customer_id
     or new.vendor_id      is distinct from old.vendor_id
     or new.vendor_service_id is distinct from old.vendor_service_id
     or new.quoted_price   is distinct from old.quoted_price
     or new.created_at     is distinct from old.created_at then
    raise exception 'Booking identity and price are immutable.'
      using errcode = '42501';
  end if;

  -- Status moves only through transition_booking_status(), which sets this
  -- flag for the duration of its own UPDATE.
  if new.status is distinct from old.status
     and coalesce(current_setting('ocasio.allow_status_change', true), '') <> 'on' then
    raise exception 'Booking status must be changed through transition_booking_status().'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger bookings_protect_fields
  before update on public.bookings
  for each row execute function public.protect_booking_fields();

-- ---------------------------------------------------------------------------
-- create_booking()
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because it must insert into bookings and
-- booking_status_history, neither of which has an INSERT policy. It takes no
-- SQL text, runs no dynamic SQL, and pins search_path.
--
-- The caller cannot supply customer_id, vendor_id, quoted_price or status.
-- customer_id comes from auth.uid(); vendor_id and price are derived from the
-- service; status is forced to 'pending'.
create or replace function public.create_booking(
  p_vendor_service_id uuid,
  p_event_date        date,
  p_event_location    text,
  p_customer_notes    text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_service   public.vendor_services;
  v_vendor    public.vendors;
  v_price     integer;
  v_booking   public.bookings;
begin
  if v_uid is null then
    raise exception 'You must be signed in to request a booking.' using errcode = '42501';
  end if;

  select * into v_service from public.vendor_services where id = p_vendor_service_id;
  if not found then
    raise exception 'That service does not exist.' using errcode = 'P0002';
  end if;
  if not v_service.is_active then
    raise exception 'That service is not accepting bookings.' using errcode = '22023';
  end if;

  -- Derived, never supplied. This is also what makes "the service must belong
  -- to the vendor" true by construction rather than by validation.
  select * into v_vendor from public.vendors where id = v_service.vendor_id;
  if not found then
    raise exception 'That vendor does not exist.' using errcode = 'P0002';
  end if;
  if v_vendor.status <> 'active' then
    raise exception 'That vendor is not accepting bookings.' using errcode = '22023';
  end if;

  if v_vendor.owner_id = v_uid then
    raise exception 'You cannot book your own listing.' using errcode = '22023';
  end if;

  if p_event_date is null then
    raise exception 'An event date is required.' using errcode = '22023';
  end if;
  -- Checked here rather than as a CHECK constraint: a constraint comparing to
  -- current_date would turn every past booking invalid over time and block
  -- later updates to it.
  if p_event_date < current_date then
    raise exception 'The event date cannot be in the past.' using errcode = '22023';
  end if;

  if coalesce(trim(p_event_location), '') = '' then
    raise exception 'An event location is required.' using errcode = '22023';
  end if;

  -- Pricing basis, in order: the service price, else the vendor's starting
  -- price. Seeded services carry no price, so in practice the vendor starting
  -- price is what is quoted today. See docs/OCASIO_BOOKINGS.md.
  v_price := coalesce(v_service.price, v_vendor.starting_price);
  if v_price is null then
    raise exception 'This service has no published price, so it cannot be booked online yet.'
      using errcode = '22023';
  end if;

  insert into public.bookings (
    customer_id, vendor_id, vendor_service_id,
    event_date, event_location, customer_notes,
    quoted_price, status
  )
  values (
    v_uid, v_vendor.id, v_service.id,
    p_event_date, trim(p_event_location), nullif(trim(coalesce(p_customer_notes, '')), ''),
    v_price, 'pending'
  )
  returning * into v_booking;

  insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  values (v_booking.id, null, 'pending', v_uid, 'Booking requested');

  return v_booking;
end;
$$;

comment on function public.create_booking is
  'The only insert path into bookings. Derives customer from auth.uid(), vendor and price from the service, and forces status=pending. Also writes the opening history row.';

revoke execute on function public.create_booking(uuid, date, text, text) from public;
grant  execute on function public.create_booking(uuid, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- transition_booking_status()
-- ---------------------------------------------------------------------------

-- Valid transitions, and who may make them:
--
--   pending  -> accepted   vendor owner
--   pending  -> declined   vendor owner
--   pending  -> cancelled  customer
--   accepted -> completed  vendor owner
--   accepted -> cancelled  customer OR vendor owner
--
-- declined, cancelled and completed are terminal. Nothing leaves them.
--
-- Allowing the vendor to cancel an accepted booking is a deliberate product
-- choice: vendors genuinely have to withdraw sometimes, and forcing them to
-- mark a job "completed" that never happened would corrupt the record. It is
-- recorded in history with the actor, so it is attributable.
create or replace function public.transition_booking_status(
  p_booking_id uuid,
  p_new_status public.booking_status,
  p_note       text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_booking    public.bookings;
  v_from       public.booking_status;
  v_is_customer boolean;
  v_is_vendor   boolean;
  v_allowed     boolean := false;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  -- FOR UPDATE serialises concurrent transitions on the same booking, so two
  -- simultaneous requests cannot both read 'pending' and both act on it.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    -- Same message whether the booking is missing or not yours: a different
    -- error would let someone probe for the existence of other people's rows.
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  v_is_customer := v_booking.customer_id = v_uid;
  v_is_vendor   := exists (
    select 1 from public.vendors v
    where v.id = v_booking.vendor_id and v.owner_id = v_uid
  );

  if not (v_is_customer or v_is_vendor) then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  if v_booking.status = p_new_status then
    raise exception 'This booking is already %.', p_new_status using errcode = '22023';
  end if;

  if v_booking.status in ('declined', 'cancelled', 'completed') then
    raise exception 'A % booking cannot change status.', v_booking.status using errcode = '22023';
  end if;

  v_allowed := case
    when v_booking.status = 'pending'  and p_new_status = 'accepted'  then v_is_vendor
    when v_booking.status = 'pending'  and p_new_status = 'declined'  then v_is_vendor
    when v_booking.status = 'pending'  and p_new_status = 'cancelled' then v_is_customer
    when v_booking.status = 'accepted' and p_new_status = 'completed' then v_is_vendor
    when v_booking.status = 'accepted' and p_new_status = 'cancelled' then v_is_customer or v_is_vendor
    else false
  end;

  if not v_allowed then
    raise exception 'You cannot change this booking from % to %.', v_booking.status, p_new_status
      using errcode = '42501';
  end if;

  -- Captured before the UPDATE so the history row records where it came from.
  v_from := v_booking.status;

  -- Lets this function's UPDATE past protect_booking_fields(), which otherwise
  -- rejects every status change. Scoped to the transaction.
  perform set_config('ocasio.allow_status_change', 'on', true);

  update public.bookings
  set status = p_new_status
  where id = p_booking_id
  returning * into v_booking;

  perform set_config('ocasio.allow_status_change', 'off', true);

  insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  values (p_booking_id, v_from, p_new_status, v_uid, nullif(trim(coalesce(p_note, '')), ''));

  return v_booking;
end;
$$;

comment on function public.transition_booking_status is
  'The only path that changes booking status. Validates the transition against the lifecycle and the caller''s relationship to the booking, then records an immutable history row.';

revoke execute on function public.transition_booking_status(uuid, public.booking_status, text) from public;
grant  execute on function public.transition_booking_status(uuid, public.booking_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.bookings              enable row level security;
alter table public.booking_status_history enable row level security;

-- bookings: read only, for the two parties. No INSERT, UPDATE or DELETE policy
-- exists, so every write must go through the functions above.
create policy "bookings: customer reads own"
  on public.bookings for select
  to authenticated
  using ((select auth.uid()) = customer_id);

create policy "bookings: vendor owner reads own"
  on public.bookings for select
  to authenticated
  using (public.owns_vendor(vendor_id));

-- history: readable by whoever can read the booking. No write policies at all,
-- so it is append-only from the client's perspective and cannot be forged,
-- edited or deleted.
create policy "booking history: parties read"
  on public.booking_status_history for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = (select auth.uid()) or public.owns_vendor(b.vendor_id))
    )
  );
