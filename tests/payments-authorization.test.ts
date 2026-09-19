/**
 * Payment, refund and idempotency tests (Phase 4).
 *
 * Real Postgres, real RLS, real functions.
 *
 * As in the booking suite, these assert on *state* rather than on whether an
 * error came back: payments has no UPDATE policy, so a malicious update
 * silently matches zero rows and returns success. Asserting "no error" would
 * pass while proving nothing.
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

let keySeq = 0;
const key = (label: string) => `${label}-${Date.now()}-${keySeq++}`;

interface VendorFixture {
  owner: TestUser;
  vendorId: string;
  serviceId: string;
  servicePrice: number;
}

async function createVendor(label: string, servicePrice: number): Promise<VendorFixture> {
  const owner = await createTestUser(`payvendor-${label}`);
  const admin = serviceClient();

  const { data: vendor, error } = await owner.client.rpc('request_vendor_onboarding', {
    p_business_name: `Pay Vendor ${label} ${Date.now()}`,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await admin.from('vendors').update({ status: 'active', starting_price: 40_000 }).eq('id', vendor.id);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: `Svc ${label}`, price: servicePrice })
    .select()
    .single();

  return { owner, vendorId: vendor.id, serviceId: service!.id, servicePrice };
}

let customerA: TestUser;
let customerB: TestUser;
let vendorA: VendorFixture;
let vendorB: VendorFixture;

beforeAll(async () => {
  if (!running) return;
  [customerA, customerB] = await Promise.all([
    createTestUser('paycust-a'),
    createTestUser('paycust-b'),
  ]);
  vendorA = await createVendor('a', 80_000);
  vendorB = await createVendor('b', 25_000);
});

afterAll(async () => {
  if (!running) return;
  const admin = serviceClient();
  const vendorIds = [vendorA?.vendorId, vendorB?.vendorId].filter(Boolean) as string[];
  if (vendorIds.length === 0) return;

  // Order matters: payments reference bookings and vendors with ON DELETE
  // RESTRICT, and refunds reference payments the same way. Deleting out of
  // order silently leaves fixture vendors behind, and because they are
  // status='active' they then appear in the public catalogue and break the
  // marketplace tests' exact vendor counts.
  const { data: payments } = await admin.from('payments').select('id').in('vendor_id', vendorIds);
  const paymentIds = (payments ?? []).map((p) => p.id);

  if (paymentIds.length > 0) {
    await admin.from('refunds').delete().in('payment_id', paymentIds);
    await admin.from('payment_events').delete().in('payment_id', paymentIds);
    await admin.from('payments').delete().in('id', paymentIds);
  }
  await admin.from('bookings').delete().in('vendor_id', vendorIds);
  await admin.from('vendor_services').delete().in('vendor_id', vendorIds);
  await admin.from('vendors').delete().in('id', vendorIds);

  await Promise.all(
    [customerA, customerB, vendorA?.owner, vendorB?.owner].filter(Boolean).map(deleteTestUser),
  );
});

/** An accepted booking, ready to pay. */
async function acceptedBooking(customer: TestUser, vendor: VendorFixture, days: number) {
  const { data: booking, error } = await customer.client.rpc('create_booking', {
    p_vendor_service_id: vendor.serviceId,
    p_event_date: futureDate(days),
    p_event_location: 'Mumbai',
  });
  if (error) throw new Error(`booking failed: ${error.message}`);

  const { error: tErr } = await vendor.owner.client.rpc('transition_booking_status', {
    p_booking_id: booking.id,
    p_new_status: 'accepted',
  });
  if (tErr) throw new Error(`accept failed: ${tErr.message}`);
  return booking;
}

/** An accepted booking with a settled payment. */
async function paidBooking(customer: TestUser, vendor: VendorFixture, days: number) {
  const booking = await acceptedBooking(customer, vendor, days);
  const { data: payment } = await customer.client.rpc('create_payment_for_booking', {
    p_booking_id: booking.id,
    p_idempotency_key: key('pay'),
  });
  const providerRef = `pp_${payment.id}`;
  await customer.client.rpc('start_payment', {
    p_payment_id: payment.id,
    p_provider_payment_id: providerRef,
  });
  await serviceClient().rpc('process_payment_event', {
    p_provider: 'test',
    p_provider_event_id: key('evt'),
    p_event_type: 'payment.succeeded',
    p_provider_payment_id: providerRef,
    p_signature_verified: true,
  });
  const { data: settled } = await serviceClient()
    .from('payments')
    .select('*')
    .eq('id', payment.id)
    .single();
  return { booking, payment: settled!, providerRef };
}

// ---------------------------------------------------------------------------

describe.runIf(running)('payment creation and price integrity', () => {
  it('creates a payment for an accepted booking', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 200);
    const { data, error } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('create'),
    });
    expect(error).toBeNull();
    expect(data.status).toBe('pending');
    expect(data.customer_id).toBe(customerA.id);
    expect(data.vendor_id).toBe(vendorA.vendorId);
  });

  it('derives the amount from the booking, in minor units', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 201);
    const { data } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('amount'),
    });
    // Bookings store rupees; payments store paise.
    expect(data.amount_minor).toBe(booking.quoted_price * 100);
    expect(data.amount_minor).toBe(vendorA.servicePrice * 100);
    expect(data.currency).toBe('INR');
  });

  it('the client cannot dictate the amount, status, customer or vendor', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 202);
    const { data, error } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('spoof'),
      p_amount_minor: 1,
      p_status: 'succeeded',
      p_customer_id: customerB.id,
      p_vendor_id: vendorB.vendorId,
    } as Record<string, unknown>);

    // PostgREST rejects unknown parameters; if it did not, nothing is spoofed.
    if (!error) {
      expect(data.amount_minor).toBe(booking.quoted_price * 100);
      expect(data.status).toBe('pending');
      expect(data.customer_id).toBe(customerA.id);
      expect(data.vendor_id).toBe(vendorA.vendorId);
    } else {
      expect(error.message).toBeTruthy();
    }
  });

  it('a later price change does not alter an existing payment', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 203);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('snapshot'),
    });
    const original = payment.amount_minor;

    await serviceClient()
      .from('vendor_services')
      .update({ price: 999_999 })
      .eq('id', vendorA.serviceId);

    const { data: after } = await serviceClient()
      .from('payments')
      .select('amount_minor')
      .eq('id', payment.id)
      .single();
    expect(after!.amount_minor).toBe(original);

    await serviceClient()
      .from('vendor_services')
      .update({ price: vendorA.servicePrice })
      .eq('id', vendorA.serviceId);
  });

  it('a pending booking cannot be paid', async () => {
    const { data: booking } = await customerA.client.rpc('create_booking', {
      p_vendor_service_id: vendorA.serviceId,
      p_event_date: futureDate(204),
      p_event_location: 'Mumbai',
    });
    const { error } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('unaccepted'),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not ready for payment/i);
  });

  it('a cancelled booking cannot be paid', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 205);
    await customerA.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'cancelled',
    });
    const { error } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('cancelled'),
    });
    expect(error).not.toBeNull();
  });

  it('a customer cannot pay another customer\'s booking', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 206);
    const { error } = await customerB.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('other'),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found/i);
  });

  it('an anonymous visitor cannot create a payment', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 207);
    const { error } = await anonClient().rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('anon'),
    });
    expect(error).not.toBeNull();
  });
});

describe.runIf(running)('idempotency', () => {
  it('the same idempotency key returns the same payment', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 210);
    const k = key('idem');
    const { data: first } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: k,
    });
    const { data: second } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: k,
    });
    expect(second.id).toBe(first.id);

    const { count } = await serviceClient()
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', booking.id);
    expect(count).toBe(1);
  });

  it('a second live payment for the same booking is refused', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 211);
    await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('live1'),
    });
    const { error } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('live2'),
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('another user cannot read a payment by guessing its idempotency key', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 212);
    const k = key('leak');
    await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: k,
    });
    const { error } = await customerB.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: k,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found/i);
  });

  it('a redelivered webhook event does not apply twice', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 213);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('replay'),
    });
    const ref = `pp_${payment.id}`;
    await customerA.client.rpc('start_payment', {
      p_payment_id: payment.id,
      p_provider_payment_id: ref,
    });

    const eventId = key('evt-replay');
    const admin = serviceClient();
    await admin.rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: eventId,
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: ref,
      p_signature_verified: true,
    });
    // Same event id, contradictory outcome.
    await admin.rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: eventId,
      p_event_type: 'payment.failed',
      p_provider_payment_id: ref,
      p_signature_verified: true,
    });

    const { data } = await admin.from('payments').select('status').eq('id', payment.id).single();
    expect(data!.status).toBe('succeeded');

    const { count } = await admin
      .from('payment_events')
      .select('*', { count: 'exact', head: true })
      .eq('provider_event_id', eventId);
    expect(count).toBe(1);
  });

  it('replaying a failure event does not append a second audit record', async () => {
    // The settled-state guard covers a replay onto a SUCCEEDED payment, so it
    // masks the replay guard there. A failed payment is not "settled", so this
    // is the path where the processed_at check is the only thing standing
    // between one delivery and two financial audit entries.
    const booking = await acceptedBooking(customerA, vendorA, 216);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('audit-replay'),
    });
    const ref = `pp_${payment.id}`;
    await customerA.client.rpc('start_payment', {
      p_payment_id: payment.id,
      p_provider_payment_id: ref,
    });

    const eventId = key('evt-fail-replay');
    const admin = serviceClient();
    const deliver = () =>
      admin.rpc('process_payment_event', {
        p_provider: 'test',
        p_provider_event_id: eventId,
        p_event_type: 'payment.failed',
        p_provider_payment_id: ref,
        p_signature_verified: true,
      });

    await deliver();
    await deliver();
    await deliver();

    const { count } = await admin
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', payment.id)
      .eq('action', 'payment.failed');
    expect(count).toBe(1);

    const { data: status } = await admin
      .from('payments')
      .select('status')
      .eq('id', payment.id)
      .single();
    expect(status!.status).toBe('failed');
  });

  it('a late failure event cannot unsettle a succeeded payment', async () => {
    const { payment, providerRef } = await paidBooking(customerA, vendorA, 214);
    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('late-fail'),
      p_event_type: 'payment.failed',
      p_provider_payment_id: providerRef,
      p_signature_verified: true,
    });
    const { data } = await serviceClient()
      .from('payments')
      .select('status')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('succeeded');
  });

  it('a repeated success event leaves the payment settled once', async () => {
    const { payment, providerRef } = await paidBooking(customerA, vendorA, 215);
    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('dup-success'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: providerRef,
      p_signature_verified: true,
    });
    const { data } = await serviceClient()
      .from('payments')
      .select('status, amount_refunded_minor')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('succeeded');
    expect(data!.amount_refunded_minor).toBe(0);
  });
});

describe.runIf(running)('webhook boundary', () => {
  it('an authenticated user cannot call the webhook processor', async () => {
    const { error } = await customerA.client.rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('forbidden'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: 'anything',
      p_signature_verified: true,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permission denied/i);
  });

  it('an anonymous caller cannot call the webhook processor', async () => {
    const { error } = await anonClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('anon-hook'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: 'anything',
      p_signature_verified: true,
    });
    expect(error).not.toBeNull();
  });

  it('an unverified signature is refused even under service_role', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 220);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('unsigned'),
    });
    const ref = `pp_${payment.id}`;
    await customerA.client.rpc('start_payment', {
      p_payment_id: payment.id,
      p_provider_payment_id: ref,
    });

    const { error } = await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('unsigned-evt'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: ref,
      p_signature_verified: false,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/unverified signature/i);

    const { data } = await serviceClient()
      .from('payments')
      .select('status')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('processing');
  });

  it('an event for an unknown provider reference is rejected and recorded', async () => {
    const eventId = key('orphan');
    // Returns null rather than raising, so the recorded event survives; the
    // edge function turns null into a non-2xx so the provider retries.
    const { data, error } = await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: eventId,
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: 'pp_does_not_exist',
      p_signature_verified: true,
    });
    expect(error).toBeNull();
    // The function returns a composite type, so a NULL row arrives as an object
    // of nulls rather than JSON null. Absence of an id is the signal.
    expect(data?.id ?? null).toBeNull();

    const { data: recorded } = await serviceClient()
      .from('payment_events')
      .select('processing_error, processed_at')
      .eq('provider_event_id', eventId)
      .maybeSingle();
    expect(recorded?.processing_error).toMatch(/no matching payment/i);
    // Left unprocessed so a retry, once the payment exists, can still apply it.
    expect(recorded?.processed_at).toBeNull();
  });
});

describe.runIf(running)('direct write attempts are blocked', () => {
  it('a customer cannot INSERT a payment directly', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 230);
    const { error } = await customerA.client.from('payments').insert({
      booking_id: booking.id,
      customer_id: customerA.id,
      vendor_id: vendorA.vendorId,
      amount_minor: 1,
      status: 'succeeded',
      provider: 'test',
      idempotency_key: key('direct'),
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('a customer cannot mark their own payment succeeded', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 231);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('selfsettle'),
    });

    await customerA.client.from('payments').update({ status: 'succeeded' }).eq('id', payment.id);

    const { data } = await serviceClient()
      .from('payments')
      .select('status')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('pending');
  });

  it('a customer cannot change the amount by direct UPDATE', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 232);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('amt'),
    });

    await customerA.client.from('payments').update({ amount_minor: 1 }).eq('id', payment.id);

    const { data } = await serviceClient()
      .from('payments')
      .select('amount_minor')
      .eq('id', payment.id)
      .single();
    expect(data!.amount_minor).toBe(payment.amount_minor);
  });

  it('a vendor cannot change the amount either', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 233);

    await vendorA.owner.client.from('payments').update({ amount_minor: 1 }).eq('id', payment.id);

    const { data } = await serviceClient()
      .from('payments')
      .select('amount_minor')
      .eq('id', payment.id)
      .single();
    expect(data!.amount_minor).toBe(payment.amount_minor);
  });

  it('nobody can forge a payment event row', async () => {
    const { error } = await customerA.client.from('payment_events').insert({
      provider: 'test',
      provider_event_id: key('forge'),
      event_type: 'payment.succeeded',
      signature_verified: true,
    });
    expect(error).not.toBeNull();
  });

  it('sensitive keys are refused in payment metadata', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 234);
    const { error } = await serviceClient()
      .from('payments')
      .update({ metadata: { cvv: '123' } })
      .eq('id', payment.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/sensitive key/i);
  });
});

describe.runIf(running)('payment visibility', () => {
  it('a customer sees their own payment', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 240);
    const { data } = await customerA.client.from('payments').select('id').eq('id', payment.id);
    expect(data!.length).toBe(1);
  });

  it('a customer cannot see another customer\'s payment', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 241);
    const { data } = await customerB.client.from('payments').select('id').eq('id', payment.id);
    expect(data).toEqual([]);
  });

  it('the vendor owner sees payments for their vendor', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 242);
    const { data } = await vendorA.owner.client.from('payments').select('id').eq('id', payment.id);
    expect(data!.length).toBe(1);
  });

  it('a vendor cannot see another vendor\'s payments', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 243);
    const { data } = await vendorB.owner.client.from('payments').select('id').eq('id', payment.id);
    expect(data).toEqual([]);
  });

  it('an anonymous visitor sees no payments', async () => {
    const { data } = await anonClient().from('payments').select('id');
    expect(data ?? []).toEqual([]);
  });

  it('no client role can read payment_events or audit_log', async () => {
    const events = await customerA.client.from('payment_events').select('id');
    const audit = await customerA.client.from('audit_log').select('id');
    expect(events.data ?? []).toEqual([]);
    expect(audit.data ?? []).toEqual([]);
  });
});

describe.runIf(running)('refunds', () => {
  it('a vendor can fully refund a settled payment', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 250);
    const { data: refund, error } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: payment.amount_minor,
      p_idempotency_key: key('full'),
    });
    expect(error).toBeNull();
    expect(refund.status).toBe('pending');

    await serviceClient().rpc('process_refund_event', {
      p_refund_id: refund.id,
      p_provider_event_id: key('rev'),
      p_event_type: 'refund.succeeded',
      p_provider_refund_id: `pr_${refund.id}`,
      p_signature_verified: true,
    });

    const { data } = await serviceClient()
      .from('payments')
      .select('status, amount_refunded_minor')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('refunded');
    expect(data!.amount_refunded_minor).toBe(payment.amount_minor);
  });

  it('a partial refund leaves the payment partially_refunded', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 251);
    const half = Math.floor(payment.amount_minor / 2);

    const { data: refund } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: half,
      p_idempotency_key: key('half'),
    });
    await serviceClient().rpc('process_refund_event', {
      p_refund_id: refund.id,
      p_provider_event_id: key('rev-half'),
      p_event_type: 'refund.succeeded',
      p_provider_refund_id: `pr_${refund.id}`,
      p_signature_verified: true,
    });

    const { data } = await serviceClient()
      .from('payments')
      .select('status, amount_refunded_minor')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('partially_refunded');
    expect(data!.amount_refunded_minor).toBe(half);
  });

  it('a customer cannot refund their own payment', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 252);
    const { error } = await customerA.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 100,
      p_idempotency_key: key('custrefund'),
    });
    expect(error).not.toBeNull();

    const { count } = await serviceClient()
      .from('refunds')
      .select('*', { count: 'exact', head: true })
      .eq('payment_id', payment.id);
    expect(count).toBe(0);
  });

  it('another vendor cannot refund this vendor\'s payment', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 253);
    const { error } = await vendorB.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 100,
      p_idempotency_key: key('crossrefund'),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found/i);
  });

  it('a refund cannot exceed the refundable balance', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 254);
    const { error } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: payment.amount_minor + 1,
      p_idempotency_key: key('over'),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/exceeds the refundable balance/i);
  });

  it('two partial refunds cannot exceed the total', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 255);
    const most = payment.amount_minor - 100;

    const { data: first } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: most,
      p_idempotency_key: key('p1'),
    });
    await serviceClient().rpc('process_refund_event', {
      p_refund_id: first.id,
      p_provider_event_id: key('rev-p1'),
      p_event_type: 'refund.succeeded',
      p_provider_refund_id: `pr_${first.id}`,
      p_signature_verified: true,
    });

    const { error } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 200,
      p_idempotency_key: key('p2'),
    });
    expect(error).not.toBeNull();
  });

  it('the same refund key does not refund twice', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 256);
    const k = key('dup');
    const { data: first } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 500,
      p_idempotency_key: k,
    });
    const { data: second } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 500,
      p_idempotency_key: k,
    });
    expect(second.id).toBe(first.id);

    const { count } = await serviceClient()
      .from('refunds')
      .select('*', { count: 'exact', head: true })
      .eq('payment_id', payment.id);
    expect(count).toBe(1);
  });

  it('a replayed refund event does not double-credit', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 257);
    const { data: refund } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 1000,
      p_idempotency_key: key('replay-refund'),
    });
    const eventId = key('rev-replay');
    const admin = serviceClient();

    await admin.rpc('process_refund_event', {
      p_refund_id: refund.id,
      p_provider_event_id: eventId,
      p_event_type: 'refund.succeeded',
      p_provider_refund_id: `pr_${refund.id}`,
      p_signature_verified: true,
    });
    await admin.rpc('process_refund_event', {
      p_refund_id: refund.id,
      p_provider_event_id: eventId,
      p_event_type: 'refund.succeeded',
      p_provider_refund_id: `pr_${refund.id}`,
      p_signature_verified: true,
    });

    const { data } = await admin
      .from('payments')
      .select('amount_refunded_minor')
      .eq('id', payment.id)
      .single();
    expect(data!.amount_refunded_minor).toBe(1000);
  });

  it('an unsettled payment cannot be refunded', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 258);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('unsettled'),
    });
    const { error } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 100,
      p_idempotency_key: key('unsettled-refund'),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/only a settled payment/i);
  });
});

describe.runIf(running)('booking and payment consistency', () => {
  it('a failed payment leaves the booking accepted and unpaid', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 260);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('fail'),
    });
    const ref = `pp_${payment.id}`;
    await customerA.client.rpc('start_payment', {
      p_payment_id: payment.id,
      p_provider_payment_id: ref,
    });
    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('fail-evt'),
      p_event_type: 'payment.failed',
      p_provider_payment_id: ref,
      p_signature_verified: true,
    });

    const admin = serviceClient();
    const { data: p } = await admin.from('payments').select('status').eq('id', payment.id).single();
    const { data: b } = await admin.from('bookings').select('status').eq('id', booking.id).single();
    expect(p!.status).toBe('failed');
    expect(b!.status).toBe('accepted');
  });

  it('a failed payment frees the booking for another attempt', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 261);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('retry1'),
    });
    const ref = `pp_${payment.id}`;
    await customerA.client.rpc('start_payment', {
      p_payment_id: payment.id,
      p_provider_payment_id: ref,
    });
    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('retry-fail'),
      p_event_type: 'payment.failed',
      p_provider_payment_id: ref,
      p_signature_verified: true,
    });

    const { error } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('retry2'),
    });
    expect(error).toBeNull();
  });

  it('Phase 3 booking transitions still work with a payment attached', async () => {
    const { booking } = await paidBooking(customerA, vendorA, 262);
    const { data, error } = await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'completed',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('completed');
  });

  it('cancelling a paid booking is still allowed and leaves the payment refundable', async () => {
    const { booking, payment } = await paidBooking(customerA, vendorA, 263);
    const { error } = await customerA.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'cancelled',
    });
    expect(error).toBeNull();

    // Phase 3 behaviour is unchanged; the money question is handled by a
    // refund, not by blocking the transition.
    const { data } = await serviceClient()
      .from('payments')
      .select('status')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('succeeded');

    const { error: refundError } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: payment.amount_minor,
      p_idempotency_key: key('after-cancel'),
    });
    expect(refundError).toBeNull();
  });

  it('a cancelled payment cannot later be settled', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 264);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('cancel-then-pay'),
    });
    const ref = `pp_${payment.id}`;
    await customerA.client.rpc('start_payment', {
      p_payment_id: payment.id,
      p_provider_payment_id: ref,
    });
    await customerA.client.rpc('cancel_payment', { p_payment_id: payment.id });

    await serviceClient().rpc('process_payment_event', {
      p_provider: 'test',
      p_provider_event_id: key('post-cancel'),
      p_event_type: 'payment.succeeded',
      p_provider_payment_id: ref,
      p_signature_verified: true,
    });

    const { data } = await serviceClient()
      .from('payments')
      .select('status')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('cancelled');
  });

  it('a settled payment cannot be cancelled', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 265);
    const { error } = await customerA.client.rpc('cancel_payment', { p_payment_id: payment.id });
    expect(error).not.toBeNull();
  });

  it('a customer cannot cancel another customer\'s payment', async () => {
    const booking = await acceptedBooking(customerA, vendorA, 266);
    const { data: payment } = await customerA.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('cross-cancel'),
    });
    const { error } = await customerB.client.rpc('cancel_payment', { p_payment_id: payment.id });
    expect(error).not.toBeNull();

    const { data } = await serviceClient()
      .from('payments')
      .select('status')
      .eq('id', payment.id)
      .single();
    expect(data!.status).toBe('pending');
  });
});

describe.runIf(running)('audit trail', () => {
  it('records creation, settlement and refund without sensitive data', async () => {
    const { payment } = await paidBooking(customerA, vendorA, 270);
    const { data: refund } = await vendorA.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 100,
      p_idempotency_key: key('audit'),
    });

    const admin = serviceClient();
    const { data: paymentEntries } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('entity_id', payment.id);
    const actions = (paymentEntries ?? []).map((e) => e.action);
    expect(actions).toContain('payment.created');
    expect(actions).toContain('payment.initiated');
    expect(actions).toContain('payment.succeeded');

    const { data: refundEntries } = await admin
      .from('audit_log')
      .select('action')
      .eq('entity_id', refund.id);
    expect((refundEntries ?? []).map((e) => e.action)).toContain('refund.initiated');

    const serialised = JSON.stringify(paymentEntries);
    for (const forbidden of ['cvv', 'card_number', 'service_role', 'access_token', 'password']) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });
});
