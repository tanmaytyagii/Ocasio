/**
 * Payment reconciliation tests (Phase 5, Part D).
 *
 * Reconciliation exists to rescue payments stranded in 'processing' when a
 * webhook never arrived. The rule it must never break: an inconclusive answer
 * from the provider changes nothing. Guessing is how money goes missing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  stackIsRunning,
  type TestUser,
} from './helpers/supabase';

const running = await stackIsRunning();

const futureDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let seq = 0;
const ref = (label: string) => `${label}-${Date.now()}-${seq++}`;

interface VendorFixture {
  owner: TestUser;
  vendorId: string;
  serviceId: string;
}

async function createVendor(label: string): Promise<VendorFixture> {
  const owner = await createTestUser(`reconvendor-${label}`);
  const admin = serviceClient();

  const { data: vendor, error } = await owner.client.rpc('request_vendor_onboarding', {
    p_business_name: `Recon Vendor ${label} ${Date.now()}`,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await admin.from('vendors').update({ status: 'active', starting_price: 45_000 }).eq('id', vendor.id);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: `Svc ${label}`, price: 90_000 })
    .select()
    .single();

  return { owner, vendorId: vendor.id, serviceId: service!.id };
}

let customer: TestUser;
let vendor: VendorFixture;
let dayCursor = 600;

beforeAll(async () => {
  if (!running) return;
  customer = await createTestUser('reconcust');
  vendor = await createVendor('a');
});

afterAll(async () => {
  if (!running) return;
  const admin = serviceClient();
  if (!vendor?.vendorId) return;

  const { data: payments } = await admin.from('payments').select('id').eq('vendor_id', vendor.vendorId);
  const ids = (payments ?? []).map((p) => p.id);
  if (ids.length) {
    await admin.from('refunds').delete().in('payment_id', ids);
    await admin.from('payment_events').delete().in('payment_id', ids);
    await admin.from('payments').delete().in('id', ids);
  }
  await admin.from('reviews').delete().eq('vendor_id', vendor.vendorId);
  await admin.from('bookings').delete().eq('vendor_id', vendor.vendorId);
  await admin.from('vendor_services').delete().eq('vendor_id', vendor.vendorId);
  await admin.from('vendors').delete().eq('id', vendor.vendorId);
  await Promise.all([customer, vendor.owner].filter(Boolean).map(deleteTestUser));
});

/** A payment left in 'processing' — the state reconciliation is for. */
async function processingPayment() {
  const { data: booking } = await customer.client.rpc('create_booking', {
    p_vendor_service_id: vendor.serviceId,
    p_event_date: futureDate(dayCursor++),
    p_event_location: 'Mumbai',
  });
  await vendor.owner.client.rpc('transition_booking_status', {
    p_booking_id: booking.id,
    p_new_status: 'accepted',
  });
  const { data: payment } = await customer.client.rpc('create_payment_for_booking', {
    p_booking_id: booking.id,
    p_idempotency_key: ref('recon-pay'),
  });
  const providerRef = `pp_${payment.id}`;
  await customer.client.rpc('start_payment', {
    p_payment_id: payment.id,
    p_provider_payment_id: providerRef,
  });
  const { data: fresh } = await serviceClient()
    .from('payments')
    .select('*')
    .eq('id', payment.id)
    .single();
  return { booking, payment: fresh!, providerRef };
}

/**
 * Backdates the handoff moment so the staleness threshold considers it.
 *
 * processing_since rather than updated_at: payments_set_updated_at is a BEFORE
 * UPDATE trigger that rewrites updated_at to now() on every write, so it can
 * never be backdated and is the wrong clock for staleness.
 */
async function ageBy(paymentId: string, minutes: number) {
  const when = new Date(Date.now() - minutes * 60_000).toISOString();
  await serviceClient().from('payments').update({ processing_since: when }).eq('id', paymentId);
}

const statusOf = async (id: string) =>
  (await serviceClient().from('payments').select('status').eq('id', id).single()).data!.status;

// ---------------------------------------------------------------------------

describe.runIf(running)('stale payment detection', () => {
  it('finds a payment left processing beyond the threshold', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);

    const { data, error } = await serviceClient().rpc('find_stale_payments', {
      p_older_than_minutes: 30,
    });
    expect(error).toBeNull();
    expect((data as { id: string }[]).map((p) => p.id)).toContain(payment.id);
  });

  it('does not report a payment that is still within the threshold', async () => {
    const { payment } = await processingPayment();

    const { data } = await serviceClient().rpc('find_stale_payments', {
      p_older_than_minutes: 30,
    });
    expect((data as { id: string }[]).map((p) => p.id)).not.toContain(payment.id);
  });

  it('does not report payments that are not processing', async () => {
    const { payment, providerRef } = await processingPayment();
    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: ref('settled'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: providerRef,
      p_signature_verified: true,
    });
    await ageBy(payment.id, 90);

    const { data } = await serviceClient().rpc('find_stale_payments', {
      p_older_than_minutes: 30,
    });
    expect((data as { id: string }[]).map((p) => p.id)).not.toContain(payment.id);
  });
});

describe.runIf(running)('applying provider outcomes', () => {
  it('a provider-reported success settles the payment', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);

    const { error } = await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('ok'),
    });
    expect(error).toBeNull();
    expect(await statusOf(payment.id)).toBe('succeeded');
  });

  it('a provider-reported failure fails the payment', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);

    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'failed',
      p_reconciliation_ref: ref('nope'),
    });
    expect(await statusOf(payment.id)).toBe('failed');
  });

  it.each(['pending', 'unknown'])(
    'a provider answer of "%s" changes nothing',
    async (providerStatus) => {
      const { payment } = await processingPayment();
      await ageBy(payment.id, 90);

      const { error } = await serviceClient().rpc('reconcile_payment', {
        p_payment_id: payment.id,
        p_provider_status: providerStatus,
        p_reconciliation_ref: ref('inconclusive'),
      });
      expect(error).toBeNull();
      // Still processing: an inconclusive answer must never be turned into an
      // outcome. This is the rule the whole feature exists to respect.
      expect(await statusOf(payment.id)).toBe('processing');
    },
  );

  it('an inconclusive answer is recorded in the audit log', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);

    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'unknown',
      p_reconciliation_ref: ref('audit-unknown'),
    });

    const { data } = await serviceClient()
      .from('audit_log')
      .select('action')
      .eq('entity_id', payment.id)
      .eq('action', 'payment.reconciliation_inconclusive');
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('an unsupported provider status is rejected', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);

    const { error } = await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'refunded',
      p_reconciliation_ref: ref('bogus'),
    });
    expect(error).not.toBeNull();
    expect(await statusOf(payment.id)).toBe('processing');
  });

  it('a blank reconciliation reference is rejected', async () => {
    const { payment } = await processingPayment();
    const { error } = await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: '   ',
    });
    expect(error).not.toBeNull();
    expect(await statusOf(payment.id)).toBe('processing');
  });
});

describe.runIf(running)('reconciliation does not corrupt settled state', () => {
  it('a payment already settled by webhook is left alone', async () => {
    const { payment, providerRef } = await processingPayment();
    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: ref('webhook-first'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: providerRef,
      p_signature_verified: true,
    });

    // A sweep arriving afterwards with a contradictory answer.
    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'failed',
      p_reconciliation_ref: ref('late-sweep'),
    });

    expect(await statusOf(payment.id)).toBe('succeeded');
  });

  it('a cancelled payment is not revived by reconciliation', async () => {
    const { payment } = await processingPayment();
    await customer.client.rpc('cancel_payment', { p_payment_id: payment.id });

    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('revive'),
    });

    expect(await statusOf(payment.id)).toBe('cancelled');
  });

  it('skipping a settled payment is recorded', async () => {
    const { payment, providerRef } = await processingPayment();
    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: ref('pre-settled'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: providerRef,
      p_signature_verified: true,
    });
    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('skip'),
    });

    const { data } = await serviceClient()
      .from('audit_log')
      .select('action')
      .eq('entity_id', payment.id)
      .eq('action', 'payment.reconciliation_skipped');
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe.runIf(running)('reconciliation idempotency and integrity', () => {
  it('repeating the same reconciliation reference applies once', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);
    const r = ref('idem');

    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: r,
    });
    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: r,
    });
    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: r,
    });

    expect(await statusOf(payment.id)).toBe('succeeded');

    // One event row, and one audit entry: replay protection is the existing
    // UNIQUE (provider, provider_event_id) on payment_events.
    const admin = serviceClient();
    const { count: events } = await admin
      .from('payment_events')
      .select('*', { count: 'exact', head: true })
      .eq('provider_event_id', `reconcile:${r}`);
    expect(events).toBe(1);

    const { count: audits } = await admin
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', payment.id)
      .eq('action', 'payment.reconciled');
    expect(audits).toBe(1);
  });

  it('the amount is never altered by reconciliation', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);

    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('amount'),
    });

    const { data } = await serviceClient()
      .from('payments')
      .select('amount_minor, currency, amount_refunded_minor')
      .eq('id', payment.id)
      .single();
    expect(data!.amount_minor).toBe(payment.amount_minor);
    expect(data!.currency).toBe(payment.currency);
    expect(data!.amount_refunded_minor).toBe(0);
  });

  it('the booking quoted_price is never altered by reconciliation', async () => {
    const { booking, payment } = await processingPayment();
    await ageBy(payment.id, 90);

    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('quote'),
    });

    const { data } = await serviceClient()
      .from('bookings')
      .select('quoted_price, status')
      .eq('id', booking.id)
      .single();
    expect(data!.quoted_price).toBe(booking.quoted_price);
    expect(data!.status).toBe('accepted');
  });

  it('reconciliation never creates a refund', async () => {
    const { payment } = await processingPayment();
    await ageBy(payment.id, 90);

    await serviceClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'failed',
      p_reconciliation_ref: ref('norefund'),
    });

    const { count } = await serviceClient()
      .from('refunds')
      .select('*', { count: 'exact', head: true })
      .eq('payment_id', payment.id);
    expect(count).toBe(0);
  });
});

describe.runIf(running)('reconciliation authorization', () => {
  it('an authenticated user cannot reconcile a payment', async () => {
    const { payment } = await processingPayment();
    const { error } = await customer.client.rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('attack'),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permission denied/i);
    expect(await statusOf(payment.id)).toBe('processing');
  });

  it('a vendor cannot reconcile their own payment', async () => {
    const { payment } = await processingPayment();
    const { error } = await vendor.owner.client.rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('vendor-attack'),
    });
    expect(error).not.toBeNull();
    expect(await statusOf(payment.id)).toBe('processing');
  });

  it('an anonymous caller cannot reconcile', async () => {
    const { payment } = await processingPayment();
    const { error } = await anonClient().rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: 'succeeded',
      p_reconciliation_ref: ref('anon-attack'),
    });
    expect(error).not.toBeNull();
  });

  it('a client cannot list stale payments', async () => {
    const authed = await customer.client.rpc('find_stale_payments', { p_older_than_minutes: 1 });
    expect(authed.error).not.toBeNull();

    const anon = await anonClient().rpc('find_stale_payments', { p_older_than_minutes: 1 });
    expect(anon.error).not.toBeNull();
  });
});
