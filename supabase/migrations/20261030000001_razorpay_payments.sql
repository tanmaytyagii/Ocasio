-- ============================================================================
-- Ocasio — Razorpay payments
--
-- Connects the payment domain from migration 5 to Razorpay. Nothing a 'test'
-- provider payment does changes; Razorpay gets its own, stricter path.
--
--   browser ──► payments-create-order   (edge function, acting as the customer)
--                 begin_razorpay_payment()      the booking's payment row
--                 Razorpay Orders API           amount read from that row
--                 prepare_razorpay_checkout()   service role: order id, processing
--   browser ──► Razorpay Checkout              opened with the order id only
--   Razorpay ──► payments-webhook       (edge function, signature verified)
--                 process_razorpay_payment_event()   the only way to 'succeeded'
--                 process_razorpay_refund_event()    the only way a refund lands
--   browser ──► payments-refund         (edge function, vendor owner or admin)
--                 create_razorpay_refund()      reserves the amount
--                 Razorpay Refunds API          receipt = refund id (idempotent)
--                 record_razorpay_refund_submission()
--
-- Rules carried forward: the client supplies intent, never facts; tables that
-- hold money are written only by functions; only a signature-verified webhook
-- settles money.
--
-- New rules:
--   * One Razorpay payment — and therefore one Razorpay order — per booking.
--     Every retry reopens the same order, so a booking cannot be charged twice
--     through two orders.
--   * A verified capture always lands. If money moved for an attempt our own
--     state calls cancelled, it is recorded and flagged for review, never
--     ignored.
--   * A pending refund reserves its amount, so concurrent requests cannot add
--     up to more than was paid.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Closing a hole: write_audit() was executable by anon
-- ---------------------------------------------------------------------------
--
-- Migration 5 revoked execute from PUBLIC, but Supabase's default privileges
-- grant execute on new public functions to anon and authenticated explicitly,
-- and a revoke from PUBLIC does not remove explicit grants. write_audit() is
-- SECURITY DEFINER, so any visitor with the anon key could insert audit rows
-- recorded as 'system' — including forged 'refund.succeeded' entries.
--
-- Every legitimate caller is either SECURITY DEFINER (runs as the owner) or
-- granted to service_role only, so this removes nothing that should work.
revoke execute on function public.write_audit(text, text, uuid, jsonb, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Schema
-- ---------------------------------------------------------------------------

-- Provider names were free text. 'Razorpay' and ' razorpay' would have slipped
-- past every rule below that keys on 'razorpay'.
alter table public.payments
  add constraint payments_provider_lowercase check (provider = lower(trim(provider)));

alter table public.payments
  add column provider_order_id text;

comment on column public.payments.provider_order_id is
  'The provider order this payment settles against (Razorpay order_…). Set once, server-side, by prepare_razorpay_checkout(); webhooks are matched on it.';

create unique index payments_provider_order_uniq
  on public.payments (provider, provider_order_id)
  where provider_order_id is not null;

-- One Razorpay payment per booking, in every status. A booking's retries all
-- reuse it, and so reuse its order: a second order for the same booking — the
-- only way to take its money twice — cannot exist.
create unique index payments_one_razorpay_per_booking
  on public.payments (booking_id)
  where provider = 'razorpay';

alter table public.refunds
  add column provider_submitted_at timestamptz;

comment on column public.refunds.provider_submitted_at is
  'When a refund request was last sent to the provider. A short lease: while it is fresh, a second request for the same refund is not sent.';

-- ---------------------------------------------------------------------------
-- 3. Field protection
-- ---------------------------------------------------------------------------

-- Unchanged from migration 5, plus: the provider, the provider order and the
-- provider payment reference cannot change once set. Each of them decides
-- which webhook settles which payment, so rewriting one — by a bug or by a
-- service-role tool — could attribute someone else's money to this row.
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
     or new.provider     is distinct from old.provider
     or new.created_at   is distinct from old.created_at then
    raise exception 'Payment identity and amount are immutable.' using errcode = '42501';
  end if;

  if old.provider_order_id is not null
     and new.provider_order_id is distinct from old.provider_order_id then
    raise exception 'A payment''s provider order cannot change once set.' using errcode = '42501';
  end if;

  if old.provider_payment_id is not null
     and new.provider_payment_id is distinct from old.provider_payment_id then
    raise exception 'A payment''s provider reference cannot change once set.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('ocasio.allow_payment_status_change', true), '') <> 'on' then
    raise exception 'Payment status is set by the payment functions, not directly.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. start_payment() — not for Razorpay
-- ---------------------------------------------------------------------------

-- Unchanged from migration 6 except for the provider check. start_payment()
-- lets the browser name the provider reference, which is right for the test
-- adapter and wrong for Razorpay: there, the reference is the order, and only
-- prepare_razorpay_checkout() may record it.
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

  if v_payment.provider = 'razorpay' then
    raise exception 'Razorpay payments are started by the checkout service.' using errcode = '42501';
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

revoke execute on function public.start_payment(uuid, text) from public, anon;
grant  execute on function public.start_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. begin_razorpay_payment() — the booking's payment row
-- ---------------------------------------------------------------------------

-- Returns the booking's Razorpay payment, creating it on first use.
--
-- Safe for the browser to call directly: it can only produce a pending row for
-- the caller's own accepted booking, at a price the database derives. It
-- cannot attach an order or move money — prepare_razorpay_checkout() and the
-- webhook functions do that, and neither is granted to the browser.
--
-- The booking row is locked first, so two concurrent calls queue here and the
-- second sees the row the first created instead of colliding on insert.
create or replace function public.begin_razorpay_payment(p_booking_id uuid)
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

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.customer_id <> v_uid then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  select * into v_payment
  from public.payments
  where booking_id = p_booking_id and provider = 'razorpay';

  if found then
    if v_payment.status in ('succeeded', 'partially_refunded', 'refunded') then
      raise exception 'This booking has already been paid.' using errcode = '22023';
    end if;
    if v_booking.status <> 'accepted' then
      raise exception 'This booking is not ready for payment. Only an accepted booking can be paid.'
        using errcode = '22023';
    end if;
    return v_payment;
  end if;

  -- First attempt. create_payment_for_booking() owns the ownership and status
  -- checks and the one place rupees become paise.
  select * into v_payment
  from public.create_payment_for_booking(p_booking_id, 'razorpay:' || p_booking_id::text, 'razorpay');

  return v_payment;
end;
$$;

comment on function public.begin_razorpay_payment is
  'Returns the booking''s single Razorpay payment, creating it (pending) on first use. Callable by the customer; cannot attach an order or settle anything.';

revoke execute on function public.begin_razorpay_payment(uuid) from public, anon;
grant  execute on function public.begin_razorpay_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. prepare_razorpay_checkout() — attach the order, open the attempt
-- ---------------------------------------------------------------------------

-- Service role only: the payments-create-order function calls it after creating
-- (or finding) the Razorpay order, passing the customer it authenticated.
--
-- Records the order id the first time and moves the payment to 'processing'
-- from pending, failed or cancelled — a retry reopens the same order rather
-- than creating another one.
--
-- The order amount and currency are what Razorpay echoed back, and must equal
-- the stored payment. Anything else is a bug or tampering, and attaching it
-- would let a cheaper order settle a more expensive booking.
--
-- SECURITY INVOKER, like the other service-role payment functions: if execute
-- were ever granted to `authenticated` by mistake, RLS would still stop the
-- write, because payments has no UPDATE policy.
create or replace function public.prepare_razorpay_checkout(
  p_payment_id         uuid,
  p_customer_id        uuid,
  p_order_id           text default null,
  p_order_amount_minor bigint default null,
  p_order_currency     text default null
)
returns public.payments
language plpgsql
set search_path = ''
as $$
declare
  v_payment        public.payments;
  v_booking_status public.booking_status;
  v_from           public.payment_status;
  v_order          text := nullif(trim(coalesce(p_order_id, '')), '');
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.customer_id is distinct from p_customer_id then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  if v_payment.provider <> 'razorpay' then
    raise exception 'This payment is not handled by Razorpay.' using errcode = '22023';
  end if;

  if v_payment.status in ('succeeded', 'partially_refunded', 'refunded') then
    raise exception 'This booking has already been paid.' using errcode = '22023';
  end if;

  -- FOR SHARE queues behind a concurrent transition_booking_status(), so a
  -- booking cancelled a moment ago cannot have its checkout reopened.
  select status into v_booking_status
  from public.bookings where id = v_payment.booking_id
  for share;

  if v_booking_status is distinct from 'accepted' then
    raise exception 'This booking is not ready for payment. Only an accepted booking can be paid.'
      using errcode = '22023';
  end if;

  if v_payment.provider_order_id is null then
    if coalesce(v_order, '') !~ '^order_[A-Za-z0-9]{6,40}$' then
      raise exception 'A Razorpay order id is required.' using errcode = '22023';
    end if;

    if p_order_amount_minor is distinct from v_payment.amount_minor
       or upper(trim(coalesce(p_order_currency, ''))) is distinct from v_payment.currency then
      raise exception 'The Razorpay order does not match this payment.' using errcode = '22023';
    end if;

    update public.payments set provider_order_id = v_order
    where id = v_payment.id
    returning * into v_payment;

    perform public.write_audit('payment.order_created', 'payment', v_payment.id,
      jsonb_build_object('provider_order_id', v_order, 'amount_minor', v_payment.amount_minor,
                         'customer_id', p_customer_id));

  elsif v_order is not null and v_order <> v_payment.provider_order_id then
    -- Two requests raced to create the order. The first one recorded wins; the
    -- other was never shown to anyone and cannot be paid without its id.
    perform public.write_audit('payment.order_superseded', 'payment', v_payment.id,
      jsonb_build_object('kept', v_payment.provider_order_id, 'discarded', v_order));
  end if;

  if v_payment.status <> 'processing' then
    v_from := v_payment.status;

    perform set_config('ocasio.allow_payment_status_change', 'on', true);
    update public.payments
    set status = 'processing', processing_since = now()
    where id = v_payment.id
    returning * into v_payment;
    perform set_config('ocasio.allow_payment_status_change', 'off', true);

    perform public.write_audit('payment.initiated', 'payment', v_payment.id,
      jsonb_build_object('provider', 'razorpay', 'from_status', v_from::text,
                         'provider_order_id', v_payment.provider_order_id));
  end if;

  return v_payment;
end;
$$;

comment on function public.prepare_razorpay_checkout is
  'Service role only. Attaches the Razorpay order (once, amount-checked) and moves the payment to processing. The only path that sets provider_order_id.';

revoke execute on function public.prepare_razorpay_checkout(uuid, uuid, text, bigint, text) from public, anon, authenticated;
grant  execute on function public.prepare_razorpay_checkout(uuid, uuid, text, bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. process_razorpay_payment_event() — the only way to 'succeeded'
-- ---------------------------------------------------------------------------

-- Called by payments-webhook after it has verified Razorpay's signature over
-- the raw body. SECURITY INVOKER and service_role only, for the same reason as
-- process_payment_event().
--
-- Matches on the order id, which this database recorded before Checkout ever
-- opened. Duplicates are no-ops: payment_events is unique on
-- (provider, provider_event_id), and an event counts as applied once
-- processed_at is set.
--
--   payment.captured  the money moved. Verified against the stored amount and
--                     currency, then applied from processing, failed, pending
--                     or cancelled alike. A capture for an attempt we thought
--                     cancelled is still money taken, so it is recorded and
--                     flagged for review rather than dropped.
--   payment.failed    one attempt failed. The order stays payable — Razorpay
--                     lets the customer retry in the same Checkout — so this
--                     moves 'processing' to 'failed' and nothing else. A
--                     failure arriving after a capture is an earlier attempt
--                     reported late and is ignored.
--
-- Returns NULL when no payment has that order: the event is recorded with
-- processed_at left NULL, for an operator to look at.
create or replace function public.process_razorpay_payment_event(
  p_event_id            text,
  p_event_type          text,
  p_order_id            text,
  p_provider_payment_id text,
  p_amount_minor        bigint,
  p_currency            text,
  p_signature_verified  boolean,
  p_payload             jsonb default '{}'::jsonb
)
returns public.payments
language plpgsql
set search_path = ''
as $$
declare
  v_payment        public.payments;
  v_event          public.payment_events;
  v_from           public.payment_status;
  v_booking_status public.booking_status;
  v_payload        jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if not coalesce(p_signature_verified, false) then
    raise exception 'Refusing to process a webhook event with an unverified signature.'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_event_id), '') = '' then
    raise exception 'A provider event id is required.' using errcode = '22023';
  end if;

  if p_event_type not in ('payment.captured', 'payment.failed') then
    raise exception 'Unsupported Razorpay payment event "%".', p_event_type using errcode = '22023';
  end if;

  if coalesce(trim(p_order_id), '') = '' or coalesce(trim(p_provider_payment_id), '') = '' then
    raise exception 'A payment event must name its order and payment.' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments
  where provider = 'razorpay' and provider_order_id = p_order_id
  for update;

  if not found then
    insert into public.payment_events
      (provider, provider_event_id, event_type, signature_verified, payload, processing_error)
    values ('razorpay', p_event_id, p_event_type, true, v_payload, 'no matching payment')
    on conflict (provider, provider_event_id)
      do update set processing_error = 'no matching payment', received_at = now();
    return null;
  end if;

  insert into public.payment_events
    (payment_id, provider, provider_event_id, event_type, signature_verified, payload)
  values (v_payment.id, 'razorpay', p_event_id, p_event_type, true, v_payload)
  on conflict (provider, provider_event_id)
    do update set payment_id = excluded.payment_id
  returning * into v_event;

  if v_event.processed_at is not null then
    return v_payment;  -- duplicate delivery
  end if;

  -- payment.failed ----------------------------------------------------------
  if p_event_type = 'payment.failed' then
    if v_payment.status <> 'processing' then
      update public.payment_events
      set processed_at = now(),
          processing_error = case
            when v_payment.status in ('succeeded', 'partially_refunded', 'refunded')
              then 'payment already settled; failure ignored'
            else 'no state change'
          end
      where id = v_event.id;
      return v_payment;
    end if;

    perform set_config('ocasio.allow_payment_status_change', 'on', true);
    update public.payments set status = 'failed' where id = v_payment.id
    returning * into v_payment;
    perform set_config('ocasio.allow_payment_status_change', 'off', true);

    update public.payment_events set processed_at = now() where id = v_event.id;

    perform public.write_audit('payment.failed', 'payment', v_payment.id,
      jsonb_build_object('event_type', p_event_type, 'booking_id', v_payment.booking_id,
                         'attempt', p_provider_payment_id,
                         'error_code', v_payload ->> 'error_code',
                         'error_reason', v_payload ->> 'error_reason'),
      p_event_id);
    return v_payment;
  end if;

  -- payment.captured --------------------------------------------------------
  if p_amount_minor is distinct from v_payment.amount_minor
     or upper(trim(coalesce(p_currency, ''))) is distinct from v_payment.currency then
    update public.payment_events
    set processed_at = now(), processing_error = 'amount or currency mismatch'
    where id = v_event.id;

    perform public.write_audit('payment.verification_failed', 'payment', v_payment.id,
      jsonb_build_object('expected_amount_minor', v_payment.amount_minor,
                         'received_amount_minor', p_amount_minor,
                         'expected_currency', v_payment.currency,
                         'received_currency', p_currency,
                         'provider_payment_id', p_provider_payment_id),
      p_event_id);
    return v_payment;
  end if;

  if v_payment.status in ('succeeded', 'partially_refunded', 'refunded') then
    if v_payment.provider_payment_id = p_provider_payment_id then
      update public.payment_events
      set processed_at = now(), processing_error = 'capture already applied'
      where id = v_event.id;
    else
      -- Razorpay does not accept a second payment on a paid order, so this
      -- should be impossible. If it happens, someone was charged twice.
      update public.payment_events
      set processed_at = now(), processing_error = 'second capture on a settled order'
      where id = v_event.id;
      perform public.write_audit('payment.duplicate_capture', 'payment', v_payment.id,
        jsonb_build_object('settled_with', v_payment.provider_payment_id,
                           'also_captured', p_provider_payment_id),
        p_event_id);
    end if;
    return v_payment;
  end if;

  -- Another live payment for this booking (from a different provider) would
  -- make this the second. Record which Razorpay payment to refund, and leave
  -- the status alone: the money must go back.
  if exists (
    select 1 from public.payments p
    where p.booking_id = v_payment.booking_id
      and p.id <> v_payment.id
      and p.status in ('pending', 'processing', 'succeeded', 'partially_refunded', 'refunded')
  ) then
    update public.payments set provider_payment_id = p_provider_payment_id
    where id = v_payment.id and provider_payment_id is null;

    update public.payment_events
    set processed_at = now(),
        processing_error = 'captured while another payment is live for this booking; refund required'
    where id = v_event.id;

    perform public.write_audit('payment.capture_conflict', 'payment', v_payment.id,
      jsonb_build_object('provider_payment_id', p_provider_payment_id,
                         'booking_id', v_payment.booking_id),
      p_event_id);
    return v_payment;
  end if;

  v_from := v_payment.status;

  perform set_config('ocasio.allow_payment_status_change', 'on', true);
  update public.payments
  set status = 'succeeded', provider_payment_id = p_provider_payment_id
  where id = v_payment.id
  returning * into v_payment;
  perform set_config('ocasio.allow_payment_status_change', 'off', true);

  update public.payment_events set processed_at = now() where id = v_event.id;

  perform public.write_audit('payment.succeeded', 'payment', v_payment.id,
    jsonb_build_object('event_type', p_event_type, 'booking_id', v_payment.booking_id,
                       'from_status', v_from::text, 'provider_payment_id', p_provider_payment_id),
    p_event_id);

  -- Money that arrived for an attempt the customer abandoned, or for a booking
  -- no longer accepted, is real but may need to go back. Flag it.
  select status into v_booking_status from public.bookings where id = v_payment.booking_id;
  if v_from = 'cancelled' or v_booking_status is distinct from 'accepted' then
    perform public.write_audit('payment.needs_review', 'payment', v_payment.id,
      jsonb_build_object('reason', case when v_from = 'cancelled'
                                        then 'captured after the attempt was cancelled'
                                        else 'captured for a booking that is no longer accepted' end,
                         'booking_status', v_booking_status::text),
      p_event_id);
  end if;

  return v_payment;
end;
$$;

comment on function public.process_razorpay_payment_event is
  'Applies a signature-verified Razorpay payment.captured / payment.failed event. Matches on the order id, verifies amount and currency, and is idempotent per event id.';

revoke execute on function public.process_razorpay_payment_event(text, text, text, text, bigint, text, boolean, jsonb) from public, anon, authenticated;
grant  execute on function public.process_razorpay_payment_event(text, text, text, text, bigint, text, boolean, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Refund requests
-- ---------------------------------------------------------------------------

-- The shared core of refund_payment() and create_razorpay_refund(): who may
-- refund, what may be refunded, and how much.
--
-- Who: the vendor who owns the booking, or an admin. The customer deliberately
-- cannot — a customer-initiated refund is a dispute, not a button.
--
-- How much: migration 5 compared the request with the amount already refunded,
-- which counts only refunds the provider has confirmed. Two requests in flight
-- each passed that check against the same balance. Pending refunds now reserve
-- their amount; a failed refund releases it.
--
-- The payment row is locked, so concurrent requests are checked one at a time.
create or replace function public.create_refund_record(
  p_actor_id        uuid,
  p_payment_id      uuid,
  p_amount_minor    bigint,
  p_idempotency_key text,
  p_reason          text,
  p_razorpay        boolean
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_key      text := trim(coalesce(p_idempotency_key, ''));
  v_payment  public.payments;
  v_refund   public.refunds;
  v_reserved bigint;
begin
  if p_actor_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if v_key = '' then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  -- Idempotent: the same key never refunds twice. It is returned only to
  -- someone who could have made it, so a guessed key reveals nothing.
  select * into v_refund from public.refunds where idempotency_key = v_key;
  if not found then
    select * into v_payment from public.payments where id = p_payment_id for update;
    if not found then
      raise exception 'Payment not found.' using errcode = 'P0002';
    end if;
    -- Looked up again under the lock: a concurrent request with the same key
    -- may have committed while this one waited. Without this, the second of
    -- two simultaneous clicks fails on the unique key instead of getting the
    -- refund the first one created.
    select * into v_refund from public.refunds where idempotency_key = v_key;
  end if;

  if v_refund.id is not null then
    select * into v_payment from public.payments where id = v_refund.payment_id;
  end if;

  if not (
    exists (select 1 from public.vendors v
            where v.id = v_payment.vendor_id and v.owner_id = p_actor_id)
    or exists (select 1 from public.profiles pr
               where pr.id = p_actor_id and pr.role = 'admin')
  ) then
    -- The customer can see the payment but cannot refund it, so this must not
    -- reveal whether the payment exists to anyone else.
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  if v_refund.id is not null then
    return v_refund;
  end if;

  -- Razorpay money goes back through Razorpay. A refund row the provider never
  -- hears about would reserve the balance and refund nothing.
  if v_payment.provider = 'razorpay' and not p_razorpay then
    raise exception 'Razorpay refunds are issued through the refund service.' using errcode = '22023';
  end if;
  if v_payment.provider <> 'razorpay' and p_razorpay then
    raise exception 'This payment is not handled by Razorpay.' using errcode = '22023';
  end if;

  if v_payment.status not in ('succeeded', 'partially_refunded') then
    raise exception 'Only a settled payment can be refunded.' using errcode = '22023';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'A refund amount is required.' using errcode = '22023';
  end if;

  select coalesce(sum(amount_minor), 0) into v_reserved
  from public.refunds
  where payment_id = v_payment.id and status in ('pending', 'succeeded');

  if p_amount_minor > v_payment.amount_minor - v_reserved then
    raise exception 'Refund exceeds the refundable balance.' using errcode = '22023';
  end if;

  insert into public.refunds (payment_id, amount_minor, reason, status, idempotency_key, initiated_by)
  values (v_payment.id, p_amount_minor, nullif(trim(coalesce(p_reason, '')), ''), 'pending',
          v_key, p_actor_id)
  returning * into v_refund;

  perform public.write_audit('refund.initiated', 'refund', v_refund.id,
    jsonb_build_object('payment_id', v_payment.id, 'amount_minor', p_amount_minor,
                       'reserved_before_minor', v_reserved, 'actor_id', p_actor_id,
                       'provider', v_payment.provider));

  return v_refund;
end;
$$;

comment on function public.create_refund_record is
  'Internal. Authorizes and records a pending refund, reserving its amount against the payment. Reached through refund_payment() or create_razorpay_refund().';

revoke execute on function public.create_refund_record(uuid, uuid, bigint, text, text, boolean) from public, anon, authenticated;
grant  execute on function public.create_refund_record(uuid, uuid, bigint, text, text, boolean) to service_role;

-- The browser-facing refund for 'test' payments. Same signature and messages as
-- migration 5; the rules now live in create_refund_record().
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
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  return public.create_refund_record(v_uid, p_payment_id, p_amount_minor, p_idempotency_key, p_reason, false);
end;
$$;

revoke execute on function public.refund_payment(uuid, bigint, text, text) from public, anon;
grant  execute on function public.refund_payment(uuid, bigint, text, text) to authenticated;

-- The Razorpay refund request. Service role only: payments-refund calls it with
-- the actor it authenticated from the caller's JWT, so the actor cannot be
-- chosen by a browser.
create or replace function public.create_razorpay_refund(
  p_actor_id        uuid,
  p_payment_id      uuid,
  p_amount_minor    bigint,
  p_idempotency_key text,
  p_reason          text default null
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
begin
  return public.create_refund_record(p_actor_id, p_payment_id, p_amount_minor, p_idempotency_key, p_reason, true);
end;
$$;

revoke execute on function public.create_razorpay_refund(uuid, uuid, bigint, text, text) from public, anon, authenticated;
grant  execute on function public.create_razorpay_refund(uuid, uuid, bigint, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Refund submission to Razorpay
-- ---------------------------------------------------------------------------

-- Claims the right to send a refund to Razorpay.
--
-- Razorpay treats the refund `receipt` as an idempotency key, and the refund id
-- is sent as the receipt, so even a resent request cannot refund twice. The
-- lease is the second lock: two concurrent requests for the same refund do not
-- both reach Razorpay in the first place.
create or replace function public.claim_razorpay_refund_submission(
  p_refund_id     uuid,
  p_lease_seconds integer default 60
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_refund  public.refunds;
  v_payment public.payments;
  v_claimed boolean;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found.' using errcode = 'P0002';
  end if;

  select * into v_payment from public.payments where id = v_refund.payment_id;
  if v_payment.provider <> 'razorpay' then
    raise exception 'This refund is not handled by Razorpay.' using errcode = '22023';
  end if;
  if v_payment.provider_payment_id is null then
    raise exception 'This payment has no Razorpay payment to refund.' using errcode = '22023';
  end if;

  v_claimed := v_refund.status = 'pending'
    and v_refund.provider_refund_id is null
    and (v_refund.provider_submitted_at is null
         or v_refund.provider_submitted_at
              < now() - make_interval(secs => greatest(coalesce(p_lease_seconds, 60), 10)));

  if v_claimed then
    update public.refunds set provider_submitted_at = now()
    where id = v_refund.id
    returning * into v_refund;
  end if;

  return jsonb_build_object(
    'claimed',             v_claimed,
    'refund_id',           v_refund.id,
    'status',              v_refund.status,
    'amount_minor',        v_refund.amount_minor,
    'currency',            v_payment.currency,
    'payment_id',          v_payment.id,
    'provider_payment_id', v_payment.provider_payment_id,
    'provider_refund_id',  v_refund.provider_refund_id
  );
end;
$$;

-- Records the refund Razorpay created. Its amount and currency must match the
-- request. The refund stays 'pending': an accepted API request is not a
-- completed refund. Only refund.processed completes it.
create or replace function public.record_razorpay_refund_submission(
  p_refund_id          uuid,
  p_provider_refund_id text,
  p_amount_minor       bigint,
  p_currency           text
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_refund  public.refunds;
  v_payment public.payments;
  v_ref     text := trim(coalesce(p_provider_refund_id, ''));
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found.' using errcode = 'P0002';
  end if;

  select * into v_payment from public.payments where id = v_refund.payment_id;
  if v_payment.provider <> 'razorpay' then
    raise exception 'This refund is not handled by Razorpay.' using errcode = '22023';
  end if;

  if v_ref !~ '^rfnd_[A-Za-z0-9]{6,40}$' then
    raise exception 'A Razorpay refund id is required.' using errcode = '22023';
  end if;

  if p_amount_minor is distinct from v_refund.amount_minor
     or upper(trim(coalesce(p_currency, ''))) is distinct from v_payment.currency then
    raise exception 'The Razorpay refund does not match this refund.' using errcode = '22023';
  end if;

  if v_refund.provider_refund_id is null then
    update public.refunds set provider_refund_id = v_ref
    where id = v_refund.id
    returning * into v_refund;

    perform public.write_audit('refund.submitted', 'refund', v_refund.id,
      jsonb_build_object('payment_id', v_payment.id, 'provider_refund_id', v_ref));
  elsif v_refund.provider_refund_id <> v_ref then
    raise exception 'This refund is already linked to a different Razorpay refund.' using errcode = '22023';
  end if;

  return v_refund;
end;
$$;

-- Releases the lease after a request that may not have reached Razorpay — a
-- timeout, a 5xx, "another operation is in progress". The refund stays pending
-- and can be sent again; the receipt makes a resend safe.
create or replace function public.release_razorpay_refund_submission(
  p_refund_id uuid,
  p_reason    text default null
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_refund public.refunds;
begin
  update public.refunds set provider_submitted_at = null
  where id = p_refund_id and status = 'pending' and provider_refund_id is null
  returning * into v_refund;

  if found then
    perform public.write_audit('refund.submission_retryable', 'refund', v_refund.id,
      jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
  else
    select * into v_refund from public.refunds where id = p_refund_id;
  end if;

  return v_refund;
end;
$$;

-- Marks a refund failed when Razorpay definitively refused the request, so the
-- reserved amount is released. Never applies to a refund Razorpay accepted:
-- once there is a provider refund id, only a webhook decides the outcome.
create or replace function public.fail_razorpay_refund_submission(
  p_refund_id uuid,
  p_reason    text default null
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found.' using errcode = 'P0002';
  end if;

  if v_refund.status <> 'pending' then
    return v_refund;
  end if;

  if v_refund.provider_refund_id is not null then
    raise exception 'Razorpay accepted this refund; its outcome arrives by webhook.' using errcode = '22023';
  end if;

  update public.refunds set status = 'failed'
  where id = v_refund.id
  returning * into v_refund;

  perform public.write_audit('refund.rejected', 'refund', v_refund.id,
    jsonb_build_object('payment_id', v_refund.payment_id, 'reason', left(coalesce(p_reason, ''), 300)));

  return v_refund;
end;
$$;

revoke execute on function public.claim_razorpay_refund_submission(uuid, integer) from public, anon, authenticated;
revoke execute on function public.record_razorpay_refund_submission(uuid, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.release_razorpay_refund_submission(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_razorpay_refund_submission(uuid, text) from public, anon, authenticated;
grant  execute on function public.claim_razorpay_refund_submission(uuid, integer) to service_role;
grant  execute on function public.record_razorpay_refund_submission(uuid, text, bigint, text) to service_role;
grant  execute on function public.release_razorpay_refund_submission(uuid, text) to service_role;
grant  execute on function public.fail_razorpay_refund_submission(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. process_razorpay_refund_event() — the only way a refund lands
-- ---------------------------------------------------------------------------

-- Called by payments-webhook for refund.processed and refund.failed, after the
-- signature check. SECURITY INVOKER, service_role only.
--
-- Matching, in order:
--   1. the refund id carried in the receipt — set by Ocasio on every refund it
--      requests, so a webhook that overtakes record_razorpay_refund_submission()
--      still finds its refund;
--   2. the Razorpay refund id.
--
-- A processed refund that matches neither, on a payment Ocasio settled, was
-- issued outside Ocasio — most likely from the Razorpay Dashboard. The money
-- has moved, so it is recorded as a refund, never dropped.
--
-- The state change itself is process_refund_event() from migration 5, so the
-- refunded total is computed exactly one way.
--
-- Returns NULL for refunds of payments Ocasio does not know. Raises 55000 when
-- the payment is known but its capture has not been recorded yet: webhooks can
-- arrive out of order, and the non-2xx makes Razorpay deliver it again later.
create or replace function public.process_razorpay_refund_event(
  p_event_id            text,
  p_event_type          text,
  p_provider_refund_id  text,
  p_provider_payment_id text,
  p_order_id            text,
  p_refund_reference    text,
  p_amount_minor        bigint,
  p_currency            text,
  p_signature_verified  boolean,
  p_payload             jsonb default '{}'::jsonb
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_refund  public.refunds;
  v_event   public.payment_events;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_ref     uuid;
begin
  if not coalesce(p_signature_verified, false) then
    raise exception 'Refusing to process a webhook event with an unverified signature.'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_event_id), '') = '' then
    raise exception 'A provider event id is required.' using errcode = '22023';
  end if;

  if p_event_type not in ('refund.processed', 'refund.failed') then
    raise exception 'Unsupported Razorpay refund event "%".', p_event_type using errcode = '22023';
  end if;

  if coalesce(trim(p_provider_refund_id), '') = '' or coalesce(trim(p_provider_payment_id), '') = '' then
    raise exception 'A refund event must name its refund and payment.' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments
  where provider = 'razorpay' and provider_payment_id = p_provider_payment_id
  for update;

  if not found then
    if exists (select 1 from public.payments
               where provider = 'razorpay' and provider_order_id = p_order_id) then
      raise exception 'The payment for this refund has not been recorded as captured yet.'
        using errcode = '55000';
    end if;

    insert into public.payment_events
      (provider, provider_event_id, event_type, signature_verified, payload, processing_error)
    values ('razorpay', p_event_id, p_event_type, true, v_payload, 'no matching payment')
    on conflict (provider, provider_event_id) do nothing;
    return null;
  end if;

  if p_refund_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_ref := p_refund_reference::uuid;
    select * into v_refund from public.refunds
    where id = v_ref and payment_id = v_payment.id
    for update;
  end if;

  if v_refund.id is null then
    select * into v_refund from public.refunds
    where provider_refund_id = p_provider_refund_id and payment_id = v_payment.id
    for update;
  end if;

  insert into public.payment_events
    (payment_id, provider, provider_event_id, event_type, signature_verified, payload)
  values (v_payment.id, 'razorpay', p_event_id, p_event_type, true, v_payload)
  on conflict (provider, provider_event_id)
    do update set payment_id = excluded.payment_id
  returning * into v_event;

  if v_event.processed_at is not null then
    return v_refund;  -- duplicate delivery
  end if;

  if upper(trim(coalesce(p_currency, ''))) is distinct from v_payment.currency then
    update public.payment_events
    set processed_at = now(), processing_error = 'currency mismatch'
    where id = v_event.id;
    perform public.write_audit('refund.verification_failed', 'payment', v_payment.id,
      jsonb_build_object('provider_refund_id', p_provider_refund_id, 'received_currency', p_currency),
      p_event_id);
    return v_refund;
  end if;

  if v_refund.id is null then
    if p_event_type = 'refund.failed' then
      update public.payment_events
      set processed_at = now(), processing_error = 'unknown refund failed; nothing to record'
      where id = v_event.id;
      return null;
    end if;

    -- Issued outside Ocasio. It cannot exceed what has not already been
    -- refunded — a refund the database cannot hold is an operator problem.
    if p_amount_minor is null or p_amount_minor <= 0
       or p_amount_minor > v_payment.amount_minor - v_payment.amount_refunded_minor then
      update public.payment_events
      set processed_at = now(), processing_error = 'external refund exceeds the refundable balance'
      where id = v_event.id;
      perform public.write_audit('refund.verification_failed', 'payment', v_payment.id,
        jsonb_build_object('provider_refund_id', p_provider_refund_id, 'amount_minor', p_amount_minor),
        p_event_id);
      return null;
    end if;

    insert into public.refunds
      (payment_id, amount_minor, reason, status, provider_refund_id, idempotency_key, provider_submitted_at)
    values
      (v_payment.id, p_amount_minor, 'Issued outside Ocasio (Razorpay Dashboard)', 'pending',
       p_provider_refund_id, 'razorpay-external:' || p_provider_refund_id, now())
    returning * into v_refund;

    perform public.write_audit('refund.recorded_external', 'refund', v_refund.id,
      jsonb_build_object('payment_id', v_payment.id, 'provider_refund_id', p_provider_refund_id,
                         'amount_minor', p_amount_minor),
      p_event_id);
  else
    if p_amount_minor is distinct from v_refund.amount_minor
       or (v_refund.provider_refund_id is not null and v_refund.provider_refund_id <> p_provider_refund_id) then
      update public.payment_events
      set processed_at = now(), processing_error = 'refund does not match the recorded request'
      where id = v_event.id;
      perform public.write_audit('refund.verification_failed', 'refund', v_refund.id,
        jsonb_build_object('expected_amount_minor', v_refund.amount_minor,
                           'received_amount_minor', p_amount_minor,
                           'recorded_provider_refund_id', v_refund.provider_refund_id,
                           'received_provider_refund_id', p_provider_refund_id),
        p_event_id);
      return v_refund;
    end if;

    if v_refund.provider_refund_id is null then
      update public.refunds set provider_refund_id = p_provider_refund_id
      where id = v_refund.id
      returning * into v_refund;
    end if;
  end if;

  if v_refund.status <> 'pending' then
    if (v_refund.status = 'succeeded' and p_event_type = 'refund.processed')
       or (v_refund.status = 'failed' and p_event_type = 'refund.failed') then
      update public.payment_events
      set processed_at = now(), processing_error = 'refund already settled'
      where id = v_event.id;
    else
      -- Should not happen: Razorpay refunds end in one state. If it does, the
      -- recorded outcome and the money disagree, and a person has to decide.
      update public.payment_events
      set processed_at = now(), processing_error = 'conflicts with the recorded refund outcome'
      where id = v_event.id;
      perform public.write_audit('refund.state_conflict', 'refund', v_refund.id,
        jsonb_build_object('recorded_status', v_refund.status::text, 'event_type', p_event_type),
        p_event_id);
    end if;
    return v_refund;
  end if;

  return public.process_refund_event(
    v_refund.id,
    p_event_id,
    case p_event_type when 'refund.processed' then 'refund.succeeded' else 'refund.failed' end,
    p_provider_refund_id,
    true,
    v_payload
  );
end;
$$;

comment on function public.process_razorpay_refund_event is
  'Applies a signature-verified Razorpay refund.processed / refund.failed event. Matches by receipt, then refund id; records refunds issued outside Ocasio; idempotent per event id.';

revoke execute on function public.process_razorpay_refund_event(text, text, text, text, text, text, bigint, text, boolean, jsonb) from public, anon, authenticated;
grant  execute on function public.process_razorpay_refund_event(text, text, text, text, text, text, bigint, text, boolean, jsonb) to service_role;
