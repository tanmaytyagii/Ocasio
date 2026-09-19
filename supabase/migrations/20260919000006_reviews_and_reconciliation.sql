-- Ocasio — reviews, rating aggregates and payment reconciliation
--
-- Phase 5. Two additions, both built on the existing patterns rather than
-- alongside them:
--
--   A/B  reviews, gated on a completed booking, with vendors.rating and
--        vendors.review_count derived from them by trigger.
--   D    reconciliation for payments stranded in 'processing', reusing the
--        webhook state machine instead of a second path into it.
--
-- Carried over unchanged: the client supplies intent never facts; money-bearing
-- and trust-bearing tables get SELECT policies only; every write goes through a
-- function that re-derives authorization from auth.uid().

-- ===========================================================================
-- PART A — reviews
-- ===========================================================================

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),

  -- restrict: a booking that has been reviewed is part of the vendor's public
  -- record and must not silently disappear.
  -- UNIQUE is what enforces "one review per booking" — in the database, not in
  -- application logic.
  booking_id  uuid not null unique references public.bookings (id) on delete restrict,

  -- Both derived from the booking inside create_review(), never supplied by the
  -- caller, and frozen by the protect trigger below.
  customer_id uuid not null references public.profiles (id) on delete restrict,
  vendor_id   uuid not null references public.vendors (id) on delete restrict,

  -- Whole stars. vendors.rating is the numeric(2,1) average of these.
  rating      smallint not null,
  body        text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint reviews_rating_range check (rating between 1 and 5),
  -- Optional, but not blank-when-present: a review consisting of spaces is
  -- worse than no review at all.
  constraint reviews_body_shape   check (
    body is null or (char_length(trim(body)) between 3 and 2000)
  )
);

comment on table public.reviews is
  'One review per completed booking. Written only through create_review(); immutable afterwards — there are deliberately no INSERT, UPDATE or DELETE policies.';
comment on column public.reviews.rating is
  'Whole stars, 1-5. vendors.rating is the numeric(2,1) mean of these.';

create index reviews_vendor_idx   on public.reviews (vendor_id, created_at desc);
create index reviews_customer_idx on public.reviews (customer_id, created_at desc);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Field protection
-- ---------------------------------------------------------------------------

-- Reviews are immutable to clients (no UPDATE policy), so this is unreachable
-- from the browser today. It exists so a future policy cannot silently allow a
-- review to be re-pointed at a different booking or vendor, and so service_role
-- tooling cannot do it by accident.
create or replace function public.protect_review_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id  is distinct from old.booking_id
     or new.customer_id is distinct from old.customer_id
     or new.vendor_id   is distinct from old.vendor_id
     or new.created_at  is distinct from old.created_at then
    raise exception 'Review identity is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reviews_protect_fields
  before update on public.reviews
  for each row execute function public.protect_review_fields();

-- ===========================================================================
-- PART B — rating aggregates
-- ===========================================================================

-- Phase 1 already forbids anyone with an end-user identity from writing
-- vendors.rating or vendors.review_count. That guard is what stops a vendor
-- inflating their own score, and it must stay.
--
-- But it also blocks the aggregate trigger below, which runs inside a
-- customer's INSERT and therefore has auth.uid() set. Rather than weakening the
-- guard, this adds the same transaction-scoped escape hatch Phase 4 used for
-- payment status: only recalculate_vendor_rating() sets it, and only for the
-- duration of its own UPDATE.
create or replace function public.protect_vendor_moderated_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A statement with no end-user identity is a server-side/admin context.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Vendor status is set by review, not by the vendor.'
      using errcode = '42501';
  end if;

  -- Aggregates are derived from reviews, never self-reported. The exception is
  -- recalculate_vendor_rating(), which sets ocasio.allow_rating_recompute for
  -- the length of its own statement.
  if (new.rating is distinct from old.rating
      or new.review_count is distinct from old.review_count)
     and coalesce(current_setting('ocasio.allow_rating_recompute', true), '') <> 'on' then
    raise exception 'Rating and review_count are derived from reviews and cannot be set directly.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'Vendor ownership cannot be reassigned.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Full recompute rather than an incremental adjustment.
--
-- Incrementing is where aggregate bugs live: a concurrent insert produces a
-- lost update, and any arithmetic slip is permanent because nothing ever
-- re-derives the truth. Recomputing from the table is O(reviews-per-vendor),
-- which at this scale costs nothing and cannot drift.
--
--   rating       = round(avg(rating), 1), or 0 when there are no reviews
--   review_count = count(*)
--
-- 0 / 0 is exactly the column default, so a vendor whose last review is removed
-- returns to the same representation a brand-new vendor has.
create or replace function public.recalculate_vendor_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid := coalesce(new.vendor_id, old.vendor_id);
  v_rating    numeric(2,1);
  v_count     integer;
begin
  select
    coalesce(round(avg(rating)::numeric, 1), 0),
    count(*)
  into v_rating, v_count
  from public.reviews
  where vendor_id = v_vendor_id;

  perform set_config('ocasio.allow_rating_recompute', 'on', true);
  update public.vendors
  set rating = v_rating, review_count = v_count
  where id = v_vendor_id;
  perform set_config('ocasio.allow_rating_recompute', 'off', true);

  return null;  -- AFTER trigger
end;
$$;

comment on function public.recalculate_vendor_rating is
  'Recomputes vendors.rating and review_count from the reviews table. Full recompute, not incremental, so it cannot drift or lose a concurrent update.';

-- Fires for every shape of change, so the aggregate stays correct even though
-- UPDATE and DELETE are not reachable from a client today.
create trigger reviews_recalculate_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalculate_vendor_rating();

-- ---------------------------------------------------------------------------
-- create_review()
-- ---------------------------------------------------------------------------

-- The only insert path into reviews.
--
-- The caller supplies a booking, a rating and some text. customer_id comes from
-- auth.uid(); vendor_id comes from the booking. Neither is a parameter, so
-- neither can be forged.
create or replace function public.create_review(
  p_booking_id uuid,
  p_rating     smallint,
  p_body       text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_booking public.bookings;
  v_review  public.reviews;
begin
  if v_uid is null then
    raise exception 'You must be signed in to leave a review.' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  -- Same message for "not yours" as for "does not exist", so the endpoint
  -- cannot be used to probe for other people's bookings.
  if v_booking.customer_id <> v_uid then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  -- Only completed work can be reviewed. A customer cannot manufacture this
  -- state: only the vendor owner can move a booking to 'completed', and only
  -- from 'accepted' (migration 20260919000004).
  if v_booking.status <> 'completed' then
    raise exception 'You can only review a booking once it has been completed.'
      using errcode = '22023';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'A rating between 1 and 5 is required.' using errcode = '22023';
  end if;

  insert into public.reviews (booking_id, customer_id, vendor_id, rating, body)
  values (
    v_booking.id,
    v_uid,                 -- not a parameter
    v_booking.vendor_id,   -- derived, not a parameter
    p_rating,
    nullif(trim(coalesce(p_body, '')), '')
  )
  returning * into v_review;

  perform public.write_audit(
    'review.created', 'review', v_review.id,
    jsonb_build_object('booking_id', v_booking.id, 'vendor_id', v_booking.vendor_id,
                       'rating', p_rating)
  );

  return v_review;
end;
$$;

comment on function public.create_review is
  'The only insert path into reviews. Requires a completed booking owned by the caller; derives customer and vendor from it. The UNIQUE on booking_id makes a second review impossible.';

revoke execute on function public.create_review(uuid, smallint, text) from public;
grant  execute on function public.create_review(uuid, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reviews RLS
-- ---------------------------------------------------------------------------

alter table public.reviews enable row level security;

-- Public: reviews are the point of a review system.
create policy "reviews: public read"
  on public.reviews for select
  to anon, authenticated
  using (true);

-- No INSERT policy (use create_review), and no UPDATE or DELETE policy at all.
-- Reviews are immutable. Editing and deletion are not required by any current
-- product rule, and inventing a policy for them would mean inventing the rules
-- about who may rewrite a public rating and when.

-- customer_id is an auth.users UUID and nothing public needs it. Same treatment
-- as vendors.owner_id in migration 20260919000003: drop the table-level grant
-- and re-grant the columns individually, because a column-level REVOKE does
-- nothing while a table-level GRANT SELECT stands.
--
-- MAINTENANCE: a column added to reviews later will not be readable until it is
-- added to this list. New columns are private by default.
revoke select on public.reviews from anon, authenticated;
grant  select (id, booking_id, vendor_id, rating, body, created_at, updated_at)
  on public.reviews to anon, authenticated;

-- ===========================================================================
-- PART D — payment reconciliation
-- ===========================================================================
--
-- A payment can strand in 'processing' when a webhook is never delivered. This
-- closes that hole WITHOUT inventing a second way into the payment state
-- machine: reconciliation records a payment_events row and applies the same
-- transitions the webhook path applies, so idempotency and replay protection
-- are the existing ones rather than a parallel set.
--
-- There is no real provider, so nothing here asks one anything. The caller
-- reports what the provider said; this function decides what that means.

-- When the payment entered 'processing'.
--
-- Staleness cannot be measured from updated_at: payments_set_updated_at is a
-- BEFORE UPDATE trigger that rewrites it to now() on every write, so any later
-- touch would reset the clock and hide a genuinely stranded payment. A
-- dedicated column records the handoff moment and is not rewritten.
alter table public.payments
  add column processing_since timestamptz;

comment on column public.payments.processing_since is
  'Set when the payment is handed to the provider. Staleness is measured from here, not updated_at, which every write rewrites.';

create index payments_processing_since_idx
  on public.payments (processing_since)
  where status = 'processing';

-- start_payment() now stamps it. Everything else about the function is
-- unchanged; this is the only addition.
create or replace function public.start_payment(
  p_payment_id          uuid,
  p_provider_payment_id text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_payment public.payments;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.customer_id <> v_uid then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  if v_payment.status = 'processing' then
    return v_payment;  -- idempotent
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'This payment can no longer be started.' using errcode = '22023';
  end if;

  perform set_config('ocasio.allow_payment_status_change', 'on', true);
  update public.payments
  set status = 'processing',
      provider_payment_id = nullif(trim(coalesce(p_provider_payment_id, '')), ''),
      processing_since = now()
  where id = p_payment_id
  returning * into v_payment;
  perform set_config('ocasio.allow_payment_status_change', 'off', true);

  perform public.write_audit('payment.initiated', 'payment', v_payment.id,
    jsonb_build_object('provider', v_payment.provider));

  return v_payment;
end;
$$;

revoke execute on function public.start_payment(uuid, text) from public;
grant  execute on function public.start_payment(uuid, text) to authenticated;

-- Payments stuck in 'processing' beyond a threshold.
--
-- service_role only: the list of stranded payments across all vendors is
-- operator data, not customer data.
create or replace function public.find_stale_payments(
  p_older_than_minutes integer default 30
)
returns setof public.payments
language sql
stable
as $$
  select *
  from public.payments
  where status = 'processing'
    and processing_since is not null
    and processing_since < now() - make_interval(mins => greatest(coalesce(p_older_than_minutes, 30), 1))
  order by processing_since asc;
$$;

comment on function public.find_stale_payments is
  'Payments left in processing beyond the threshold. Operator-facing: granted to service_role only.';

revoke execute on function public.find_stale_payments(integer) from public;
revoke execute on function public.find_stale_payments(integer) from anon, authenticated;
grant  execute on function public.find_stale_payments(integer) to service_role;

-- Applies a provider-reported status to a stranded payment.
--
-- SECURITY INVOKER for the same reason as process_payment_event: if this were
-- DEFINER and someone later granted it to `authenticated`, every user could
-- settle their own payments. As an invoker function, RLS stops the write even
-- then, because payments has no UPDATE policy.
--
-- p_provider_status is what the provider SAID, not what we want:
--   'succeeded' / 'failed'  -> apply, exactly as the webhook would
--   'pending'               -> provider still working; leave alone
--   'unknown'               -> provider could not tell us; leave alone
--
-- 'pending' and 'unknown' deliberately change nothing. Guessing is how money
-- goes missing.
create or replace function public.reconcile_payment(
  p_payment_id        uuid,
  p_provider_status   text,
  p_reconciliation_ref text
)
returns public.payments
language plpgsql
set search_path = ''
as $$
declare
  v_payment  public.payments;
  v_event    public.payment_events;
  v_event_id text;
  v_new      public.payment_status;
begin
  if coalesce(trim(p_reconciliation_ref), '') = '' then
    raise exception 'A reconciliation reference is required.' using errcode = '22023';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  -- Settled payments are never revisited. A reconciliation sweep arriving after
  -- a webhook already landed must not undo it.
  if v_payment.status in ('succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded') then
    perform public.write_audit(
      'payment.reconciliation_skipped', 'payment', v_payment.id,
      jsonb_build_object('reason', 'already settled', 'status', v_payment.status::text)
    );
    return v_payment;
  end if;

  if v_payment.status <> 'processing' then
    return v_payment;
  end if;

  -- Inconclusive answers are recorded and nothing moves.
  if p_provider_status in ('pending', 'unknown') then
    perform public.write_audit(
      'payment.reconciliation_inconclusive', 'payment', v_payment.id,
      jsonb_build_object('provider_status', p_provider_status, 'ref', p_reconciliation_ref)
    );
    return v_payment;
  end if;

  v_new := case p_provider_status
    when 'succeeded' then 'succeeded'::public.payment_status
    when 'failed'    then 'failed'::public.payment_status
    else null
  end;

  if v_new is null then
    raise exception 'Unsupported provider status "%".', p_provider_status using errcode = '22023';
  end if;

  -- Recorded in payment_events like any other provider outcome, so the existing
  -- UNIQUE (provider, provider_event_id) gives replay protection for free: the
  -- same sweep run twice applies once.
  v_event_id := 'reconcile:' || p_reconciliation_ref;

  insert into public.payment_events
    (payment_id, provider, provider_event_id, event_type, signature_verified, payload)
  values
    (v_payment.id, v_payment.provider, v_event_id, 'payment.' || p_provider_status, true,
     jsonb_build_object('source', 'reconciliation'))
  on conflict (provider, provider_event_id)
    do update set payment_id = excluded.payment_id
  returning * into v_event;

  if v_event.processed_at is not null then
    return v_payment;  -- this sweep already applied
  end if;

  perform set_config('ocasio.allow_payment_status_change', 'on', true);
  update public.payments set status = v_new where id = v_payment.id
  returning * into v_payment;
  perform set_config('ocasio.allow_payment_status_change', 'off', true);

  update public.payment_events set processed_at = now() where id = v_event.id;

  perform public.write_audit(
    'payment.reconciled', 'payment', v_payment.id,
    jsonb_build_object('provider_status', p_provider_status, 'new_status', v_new::text),
    v_event_id
  );

  return v_payment;
end;
$$;

comment on function public.reconcile_payment is
  'Applies a provider-reported status to a payment stranded in processing. Reuses payment_events for idempotency and replay protection. Inconclusive answers change nothing; amounts are never touched.';

revoke execute on function public.reconcile_payment(uuid, text, text) from public;
revoke execute on function public.reconcile_payment(uuid, text, text) from anon, authenticated;
grant  execute on function public.reconcile_payment(uuid, text, text) to service_role;
