-- Ocasio — payments, refunds and audit trail
--
-- Phase 4. Adds a payment layer on top of the Phase 3 booking lifecycle
-- WITHOUT changing it: booking_status is untouched, every Phase 3 transition
-- still works, and "accepted" still means the vendor agreed to the work.
-- Whether money has moved is a separate fact living in payments.
--
-- Design rules carried over from Phase 3:
--   * the client supplies intent, never facts
--   * tables that hold money have SELECT policies only; all writes go through
--     functions, so a direct write from the browser matches zero rows
--   * authorization is re-derived from auth.uid() inside every function
--
-- New rule for this phase:
--   * the browser can never move a payment to a settled state. Only the
--     provider webhook path can, and that is service_role only.

-- ---------------------------------------------------------------------------
-- Money representation
-- ---------------------------------------------------------------------------
--
-- Phase 1-3 store money as integer RUPEES (bookings.quoted_price,
-- vendor_services.price, vendors.starting_price).
--
-- Payments store integer MINOR UNITS (paise) instead, because every payment
-- provider transacts in minor units. Converting at the provider boundary
-- instead would mean either a float multiply or a rounding decision on every
-- call. Doing it once, server-side, at payment creation is safer.
--
-- The conversion lives in exactly one place: create_payment_for_booking().
-- Column names carry the unit (amount_minor) so the two can never be confused.

create type public.payment_status as enum (
  'pending',            -- record created, nothing sent to the provider yet
  'processing',         -- handed to the provider, awaiting their outcome
  'succeeded',          -- provider confirmed settlement (webhook only)
  'failed',             -- provider rejected it
  'cancelled',          -- abandoned before settlement
  'refunded',           -- settled, then fully refunded
  'partially_refunded'  -- settled, then refunded in part
);

comment on type public.payment_status is
  'Payment lifecycle. Separate from booking_status: a booking being accepted and a booking being paid are different facts.';

create type public.refund_status as enum ('pending', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),

  -- restrict: a booking with financial history must not disappear.
  booking_id            uuid not null references public.bookings (id) on delete restrict,
  -- Denormalised from the booking so policies do not need a join. Both are
  -- derived server-side and frozen by the protect trigger.
  customer_id           uuid not null references public.profiles (id) on delete restrict,
  vendor_id             uuid not null references public.vendors (id) on delete restrict,

  amount_minor          bigint not null,
  currency              char(3) not null default 'INR',
  amount_refunded_minor bigint not null default 0,

  status                public.payment_status not null default 'pending',

  provider              text not null,
  provider_payment_id   text,

  -- Supplied by the caller and unique, so a retried request reuses the
  -- existing payment instead of creating a second one.
  idempotency_key       text not null,

  -- Never contains card data, credentials or secrets; see the trigger below.
  metadata              jsonb not null default '{}'::jsonb,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint payments_amount_positive   check (amount_minor > 0),
  constraint payments_refund_bounds     check (amount_refunded_minor >= 0
                                               and amount_refunded_minor <= amount_minor),
  constraint payments_currency_upper    check (currency = upper(currency)),
  constraint payments_provider_not_blank check (char_length(trim(provider)) > 0)
);

comment on table public.payments is
  'One payment attempt against a booking. Amounts are integer minor units (paise). Written only through the functions in this migration; there are deliberately no INSERT or UPDATE policies.';
comment on column public.payments.amount_minor is
  'Integer minor units (paise). Snapshotted from bookings.quoted_price * 100 at creation, so a later price change cannot alter a historical payment.';
comment on column public.payments.idempotency_key is
  'Caller-supplied. Unique, so a retried create returns the existing payment rather than opening a second one.';

create unique index payments_idempotency_key_uniq on public.payments (idempotency_key);

-- A provider payment id must map to exactly one payment, so a replayed webhook
-- cannot be attributed to two records.
create unique index payments_provider_ref_uniq
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

-- At most one live payment per booking. A failed or cancelled attempt leaves
-- the booking payable again; a settled one does not.
create unique index payments_one_live_per_booking
  on public.payments (booking_id)
  where status in ('pending', 'processing', 'succeeded', 'partially_refunded', 'refunded');

create index payments_booking_idx  on public.payments (booking_id);
create index payments_customer_idx on public.payments (customer_id, created_at desc);
create index payments_vendor_idx   on public.payments (vendor_id, status, created_at desc);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_events — provider webhook deliveries
-- ---------------------------------------------------------------------------

create table public.payment_events (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid references public.payments (id) on delete set null,

  provider            text not null,
  -- The provider's own event id. The unique constraint below is what makes
  -- webhook processing replay-safe: a redelivered event cannot be applied twice.
  provider_event_id   text not null,
  event_type          text not null,

  -- Recorded, never assumed. The edge function sets this from a real signature
  -- check; process_payment_event() refuses anything false.
  signature_verified  boolean not null default false,

  payload             jsonb not null default '{}'::jsonb,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  processing_error    text,

  constraint payment_events_ids_not_blank
    check (char_length(trim(provider)) > 0 and char_length(trim(provider_event_id)) > 0)
);

comment on table public.payment_events is
  'Raw provider webhook deliveries. UNIQUE (provider, provider_event_id) is the replay guard. Not readable by any client role.';

create unique index payment_events_provider_event_uniq
  on public.payment_events (provider, provider_event_id);

create index payment_events_payment_idx on public.payment_events (payment_id, received_at desc);

-- ---------------------------------------------------------------------------
-- refunds
-- ---------------------------------------------------------------------------

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references public.payments (id) on delete restrict,

  amount_minor       bigint not null,
  reason             text,
  status             public.refund_status not null default 'pending',

  provider_refund_id text,
  idempotency_key    text not null,
  initiated_by       uuid references public.profiles (id) on delete set null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint refunds_amount_positive check (amount_minor > 0),
  constraint refunds_reason_length   check (reason is null or char_length(reason) <= 500)
);

comment on table public.refunds is
  'Refunds against a payment. Partial refunds are supported at the data level; there is no automated refund policy — every refund is initiated explicitly.';

create unique index refunds_idempotency_key_uniq on public.refunds (idempotency_key);
create unique index refunds_provider_ref_uniq
  on public.refunds (provider_refund_id) where provider_refund_id is not null;
create index refunds_payment_idx on public.refunds (payment_id, created_at desc);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid references public.profiles (id) on delete set null,
  actor_role        text,
  action            text not null,
  entity_type       text not null,
  entity_id         uuid,
  provider_event_id text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on table public.audit_log is
  'Operator-facing audit of sensitive booking and payment events. No client role can read it. The user-facing trail remains booking_status_history.';

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Secret scrubbing
-- ---------------------------------------------------------------------------

-- Defence against a future caller passing provider payloads straight through.
-- Card data must never reach Ocasio, but if it ever did, it must not be stored.
create or replace function public.reject_sensitive_payment_data()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_keys text[];
  v_bad  text;
begin
  if new.metadata is null or jsonb_typeof(new.metadata) <> 'object' then
    return new;
  end if;

  select array_agg(lower(k)) into v_keys from jsonb_object_keys(new.metadata) k;

  foreach v_bad in array array[
    'card_number','cardnumber','pan','cvv','cvc','card_cvv','expiry','exp_month','exp_year',
    'password','secret','api_key','apikey','service_role','access_token','refresh_token','authorization'
  ] loop
    if v_keys @> array[v_bad] then
      raise exception 'Refusing to store sensitive key "%" in metadata.', v_bad
        using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$$;

create trigger payments_reject_sensitive
  before insert or update on public.payments
  for each row execute function public.reject_sensitive_payment_data();

-- ---------------------------------------------------------------------------
-- Field protection
-- ---------------------------------------------------------------------------

-- Same shape as protect_booking_fields(). There is no UPDATE policy on
-- payments, so a client cannot reach this today; it exists so that adding one
-- later cannot silently open a hole, and so service_role tooling cannot rewrite
-- an amount or an owner by accident.
create or replace function public.protect_payment_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id   is distinct from old.booking_id
     or new.customer_id is distinct from old.customer_id
     or new.vendor_id   is distinct from old.vendor_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency     is distinct from old.currency
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at   is distinct from old.created_at then
    raise exception 'Payment identity and amount are immutable.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('ocasio.allow_payment_status_change', true), '') <> 'on' then
    raise exception 'Payment status is set by the payment functions, not directly.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger payments_protect_fields
  before update on public.payments
  for each row execute function public.protect_payment_fields();

-- ---------------------------------------------------------------------------
-- audit helper
-- ---------------------------------------------------------------------------

create or replace function public.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_metadata    jsonb default '{}'::jsonb,
  p_provider_event_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, provider_event_id, metadata)
  values (
    (select auth.uid()),
    coalesce((select role::text from public.profiles where id = (select auth.uid())), 'system'),
    p_action, p_entity_type, p_entity_id, p_provider_event_id, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

comment on function public.write_audit is
  'Appends an audit row. Internal: execute is not granted to anon or authenticated, so only the payment functions (which are definer) and service_role can call it.';

revoke execute on function public.write_audit(text, text, uuid, jsonb, text) from public;

-- ---------------------------------------------------------------------------
-- create_payment_for_booking()
-- ---------------------------------------------------------------------------

-- The only insert path into payments.
--
-- The caller supplies a booking and an idempotency key. It cannot supply an
-- amount, a currency, a customer, a vendor or a status: all are derived here.
create or replace function public.create_payment_for_booking(
  p_booking_id      uuid,
  p_idempotency_key text,
  p_provider        text default 'test'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_booking public.bookings;
  v_payment public.payments;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  -- Idempotent: the same key returns the existing payment untouched, so a
  -- retried request or a double-clicked button cannot open a second one.
  select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
  if found then
    if v_payment.customer_id <> v_uid then
      -- Keys are caller-scoped. Someone else's key must not be readable.
      raise exception 'Payment not found.' using errcode = 'P0002';
    end if;
    return v_payment;
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

  -- Payable state. A booking the vendor has not agreed to, or one that is
  -- declined, cancelled or already completed, cannot be paid for.
  if v_booking.status <> 'accepted' then
    raise exception 'This booking is not ready for payment. Only an accepted booking can be paid.'
      using errcode = '22023';
  end if;

  -- Price snapshot. bookings.quoted_price is already immutable, and copying it
  -- here means a later change to the vendor's pricing cannot alter what was
  -- charged. Rupees -> paise happens here and nowhere else.
  insert into public.payments (
    booking_id, customer_id, vendor_id,
    amount_minor, currency, status, provider, idempotency_key
  )
  values (
    v_booking.id, v_uid, v_booking.vendor_id,
    v_booking.quoted_price::bigint * 100, 'INR', 'pending', trim(p_provider), trim(p_idempotency_key)
  )
  returning * into v_payment;

  perform public.write_audit(
    'payment.created', 'payment', v_payment.id,
    jsonb_build_object('booking_id', v_booking.id, 'amount_minor', v_payment.amount_minor)
  );

  return v_payment;
end;
$$;

revoke execute on function public.create_payment_for_booking(uuid, text, text) from public;
grant  execute on function public.create_payment_for_booking(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- start_payment()
-- ---------------------------------------------------------------------------

-- Moves pending -> processing and records the provider's reference. This is
-- the furthest the browser can move a payment: it cannot reach 'succeeded'.
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
      provider_payment_id = nullif(trim(coalesce(p_provider_payment_id, '')), '')
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

-- ---------------------------------------------------------------------------
-- cancel_payment()
-- ---------------------------------------------------------------------------

create or replace function public.cancel_payment(p_payment_id uuid)
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

  if v_payment.status = 'cancelled' then
    return v_payment;  -- idempotent
  end if;

  -- A settled payment is refunded, never cancelled.
  if v_payment.status not in ('pending', 'processing') then
    raise exception 'A % payment cannot be cancelled.', v_payment.status using errcode = '22023';
  end if;

  perform set_config('ocasio.allow_payment_status_change', 'on', true);
  update public.payments set status = 'cancelled' where id = p_payment_id
  returning * into v_payment;
  perform set_config('ocasio.allow_payment_status_change', 'off', true);

  perform public.write_audit('payment.cancelled', 'payment', v_payment.id, '{}'::jsonb);
  return v_payment;
end;
$$;

revoke execute on function public.cancel_payment(uuid) from public;
grant  execute on function public.cancel_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- process_payment_event() — the webhook boundary
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER, deliberately.
--
-- This is the only path to 'succeeded'. Making it definer would mean that
-- accidentally granting execute to `authenticated` later would hand every user
-- the ability to settle their own payments. As an invoker function it writes
-- through the caller's privileges, and since payments has no INSERT/UPDATE
-- policy, a non-service_role caller fails even if execute were granted.
--
-- Execute is granted to service_role only. The edge function in
-- supabase/functions/payments-webhook verifies the provider signature and calls
-- this with the service-role key.
create or replace function public.process_payment_event(
  p_provider            text,
  p_provider_event_id   text,
  p_event_type          text,
  p_provider_payment_id text,
  p_signature_verified  boolean,
  p_payload             jsonb default '{}'::jsonb
)
returns public.payments
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_event   public.payment_events;
  v_new     public.payment_status;
begin
  if not coalesce(p_signature_verified, false) then
    raise exception 'Refusing to process a webhook event with an unverified signature.'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_provider_event_id), '') = '' then
    raise exception 'A provider event id is required.' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments
  where provider = p_provider and provider_payment_id = p_provider_payment_id
  for update;

  if not found then
    -- Record the delivery so an unmatched event is visible to operators, and
    -- leave processed_at NULL so a retry can still apply it.
    --
    -- This upserts rather than inserting: raising below rolls back an INSERT,
    -- so the row has to survive a conflict from an earlier retry too. The
    -- realistic cause is a race — the webhook arriving before our payment row
    -- committed — which is exactly the case where the provider SHOULD retry.
    insert into public.payment_events (provider, provider_event_id, event_type, signature_verified, payload, processing_error)
    values (p_provider, p_provider_event_id, p_event_type, true, coalesce(p_payload, '{}'::jsonb), 'no matching payment')
    on conflict (provider, provider_event_id)
      do update set processing_error = 'no matching payment', received_at = now();

    -- Returning null rather than raising, so the row above is not rolled back.
    -- The edge function turns a null result into a non-2xx, which is what makes
    -- the provider retry.
    return null;
  end if;

  -- Replay guard. An event is "already applied" only once processed_at is set,
  -- not merely because the row exists: an earlier delivery that could not be
  -- matched leaves a row behind that a retry must still be allowed to apply.
  insert into public.payment_events (payment_id, provider, provider_event_id, event_type, signature_verified, payload)
  values (v_payment.id, p_provider, p_provider_event_id, p_event_type, true, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, provider_event_id)
    do update set payment_id = excluded.payment_id
  returning * into v_event;

  if v_event.processed_at is not null then
    return v_payment;  -- already applied
  end if;

  v_new := case p_event_type
    when 'payment.succeeded' then 'succeeded'::public.payment_status
    when 'payment.failed'    then 'failed'::public.payment_status
    when 'payment.cancelled' then 'cancelled'::public.payment_status
    else null
  end;

  if v_new is null then
    update public.payment_events
    set processed_at = now(), processing_error = 'unsupported event type'
    where id = v_event.id;
    return v_payment;
  end if;

  -- Settled payments are terminal here; refunds have their own path. This is
  -- what stops a late 'failed' event from unsettling a succeeded payment.
  if v_payment.status in ('succeeded', 'refunded', 'partially_refunded') then
    update public.payment_events
    set processed_at = now(),
        processing_error = 'payment already settled; outcome ignored'
    where id = v_event.id;
    return v_payment;
  end if;

  if v_payment.status = 'cancelled' and v_new = 'succeeded' then
    update public.payment_events
    set processed_at = now(), processing_error = 'payment was cancelled; success ignored'
    where id = v_event.id;
    return v_payment;
  end if;

  perform set_config('ocasio.allow_payment_status_change', 'on', true);
  update public.payments set status = v_new where id = v_payment.id
  returning * into v_payment;
  perform set_config('ocasio.allow_payment_status_change', 'off', true);

  update public.payment_events set processed_at = now() where id = v_event.id;

  perform public.write_audit(
    'payment.' || v_new::text, 'payment', v_payment.id,
    jsonb_build_object('event_type', p_event_type, 'booking_id', v_payment.booking_id),
    p_provider_event_id
  );

  return v_payment;
end;
$$;

revoke execute on function public.process_payment_event(text, text, text, text, boolean, jsonb) from public;
revoke execute on function public.process_payment_event(text, text, text, text, boolean, jsonb) from anon, authenticated;
grant  execute on function public.process_payment_event(text, text, text, text, boolean, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- refund_payment()
-- ---------------------------------------------------------------------------

-- Who may refund: the vendor who owns the booking, or an admin.
--
-- The customer deliberately cannot. A customer-initiated refund is a dispute,
-- not a button, and Ocasio has no dispute process yet. Making it self-service
-- would let a customer take the money back after the work was done.
create or replace function public.refund_payment(
  p_payment_id      uuid,
  p_amount_minor    bigint,
  p_idempotency_key text,
  p_reason          text default null
)
returns public.refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_payment   public.payments;
  v_refund    public.refunds;
  v_is_vendor boolean;
  v_is_admin  boolean;
  v_remaining bigint;
  v_total     bigint;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  select * into v_refund from public.refunds where idempotency_key = p_idempotency_key;
  if found then
    return v_refund;  -- idempotent: the same key never refunds twice
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  v_is_vendor := exists (
    select 1 from public.vendors v where v.id = v_payment.vendor_id and v.owner_id = v_uid
  );
  v_is_admin := coalesce((select role from public.profiles where id = v_uid), 'customer') = 'admin';

  if not (v_is_vendor or v_is_admin) then
    -- The customer can see the payment but cannot refund it, so this must not
    -- reveal whether the payment exists to anyone else.
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  if v_payment.status not in ('succeeded', 'partially_refunded') then
    raise exception 'Only a settled payment can be refunded.' using errcode = '22023';
  end if;

  v_remaining := v_payment.amount_minor - v_payment.amount_refunded_minor;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'A refund amount is required.' using errcode = '22023';
  end if;
  if p_amount_minor > v_remaining then
    raise exception 'Refund exceeds the refundable balance.' using errcode = '22023';
  end if;

  insert into public.refunds (payment_id, amount_minor, reason, status, idempotency_key, initiated_by)
  values (p_payment_id, p_amount_minor, nullif(trim(coalesce(p_reason, '')), ''), 'pending',
          trim(p_idempotency_key), v_uid)
  returning * into v_refund;

  -- The provider settles asynchronously in reality; process_refund_event()
  -- completes it. The payment total moves only once the refund succeeds.
  v_total := v_payment.amount_refunded_minor;

  perform public.write_audit('refund.initiated', 'refund', v_refund.id,
    jsonb_build_object('payment_id', p_payment_id, 'amount_minor', p_amount_minor,
                       'refunded_so_far_minor', v_total));

  return v_refund;
end;
$$;

revoke execute on function public.refund_payment(uuid, bigint, text, text) from public;
grant  execute on function public.refund_payment(uuid, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- process_refund_event() — provider confirms or rejects a refund
-- ---------------------------------------------------------------------------

create or replace function public.process_refund_event(
  p_refund_id          uuid,
  p_provider_event_id  text,
  p_event_type         text,
  p_provider_refund_id text,
  p_signature_verified boolean,
  p_payload            jsonb default '{}'::jsonb
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_refund   public.refunds;
  v_payment  public.payments;
  v_event    public.payment_events;
  v_refunded bigint;
  v_status   public.payment_status;
begin
  if not coalesce(p_signature_verified, false) then
    raise exception 'Refusing to process a webhook event with an unverified signature.'
      using errcode = '42501';
  end if;

  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found.' using errcode = 'P0002';
  end if;

  select * into v_payment from public.payments where id = v_refund.payment_id for update;

  insert into public.payment_events (payment_id, provider, provider_event_id, event_type, signature_verified, payload)
  values (v_payment.id, v_payment.provider, p_provider_event_id, p_event_type, true, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, provider_event_id)
    do update set payment_id = excluded.payment_id
  returning * into v_event;

  if v_event.processed_at is not null then
    return v_refund;  -- already applied
  end if;

  if v_refund.status <> 'pending' then
    update public.payment_events
    set processed_at = now(), processing_error = 'refund already settled'
    where id = v_event.id;
    return v_refund;
  end if;

  if p_event_type = 'refund.succeeded' then
    update public.refunds
    set status = 'succeeded', provider_refund_id = nullif(trim(coalesce(p_provider_refund_id, '')), '')
    where id = p_refund_id
    returning * into v_refund;

    -- Recomputed from the refunds table rather than incremented, so a
    -- concurrent refund cannot produce a lost update.
    select coalesce(sum(amount_minor), 0) into v_refunded
    from public.refunds where payment_id = v_payment.id and status = 'succeeded';

    v_status := case
      when v_refunded >= v_payment.amount_minor then 'refunded'::public.payment_status
      else 'partially_refunded'::public.payment_status
    end;

    perform set_config('ocasio.allow_payment_status_change', 'on', true);
    update public.payments
    set amount_refunded_minor = v_refunded, status = v_status
    where id = v_payment.id;
    perform set_config('ocasio.allow_payment_status_change', 'off', true);

    perform public.write_audit('refund.succeeded', 'refund', v_refund.id,
      jsonb_build_object('payment_id', v_payment.id, 'amount_minor', v_refund.amount_minor,
                         'total_refunded_minor', v_refunded),
      p_provider_event_id);

  elsif p_event_type = 'refund.failed' then
    update public.refunds set status = 'failed' where id = p_refund_id returning * into v_refund;
    perform public.write_audit('refund.failed', 'refund', v_refund.id,
      jsonb_build_object('payment_id', v_payment.id), p_provider_event_id);
  else
    update public.payment_events
    set processed_at = now(), processing_error = 'unsupported refund event type'
    where id = v_event.id;
    return v_refund;
  end if;

  update public.payment_events set processed_at = now() where id = v_event.id;
  return v_refund;
end;
$$;

revoke execute on function public.process_refund_event(uuid, text, text, text, boolean, jsonb) from public;
revoke execute on function public.process_refund_event(uuid, text, text, text, boolean, jsonb) from anon, authenticated;
grant  execute on function public.process_refund_event(uuid, text, text, text, boolean, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.payments       enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds        enable row level security;
alter table public.audit_log      enable row level security;

-- payments: read only, for the two parties. No INSERT/UPDATE/DELETE policy.
create policy "payments: customer reads own"
  on public.payments for select
  to authenticated
  using ((select auth.uid()) = customer_id);

create policy "payments: vendor owner reads own"
  on public.payments for select
  to authenticated
  using (public.owns_vendor(vendor_id));

-- refunds: visible to whoever can see the underlying payment.
create policy "refunds: parties read"
  on public.refunds for select
  to authenticated
  using (
    exists (
      select 1 from public.payments p
      where p.id = payment_id
        and (p.customer_id = (select auth.uid()) or public.owns_vendor(p.vendor_id))
    )
  );

-- payment_events and audit_log: RLS enabled with NO policies, so every client
-- role is denied. Raw provider payloads and the operator audit trail are not
-- customer-facing data. service_role bypasses RLS for operational access.
