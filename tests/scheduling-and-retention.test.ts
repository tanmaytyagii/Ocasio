/**
 * Phase 5.1 — reconciliation scheduling, rating provenance, and the account
 * deletion limitation.
 *
 * The third group does not test a feature: it pins the CURRENT behaviour of
 * account deletion so that when the product decides how to handle it, the
 * change is deliberate and visible rather than silent. See
 * docs/OCASIO_DATA_RETENTION.md.
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
const key = (label: string) => `${label}-${Date.now()}-${seq++}`;

interface VendorFixture {
  owner: TestUser;
  vendorId: string;
  serviceId: string;
}

async function createVendor(label: string): Promise<VendorFixture> {
  const owner = await createTestUser(`p51vendor-${label}`);
  const admin = serviceClient();

  const { data: vendor, error } = await owner.client.rpc('request_vendor_onboarding', {
    p_business_name: `P51 Vendor ${label} ${Date.now()}`,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await admin.from('vendors').update({ status: 'active', starting_price: 40_000 }).eq('id', vendor.id);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: `Svc ${label}`, price: 60_000 })
    .select()
    .single();

  return { owner, vendorId: vendor.id, serviceId: service!.id };
}

async function purgeVendor(vendorId: string) {
  const admin = serviceClient();
  const { data: payments } = await admin.from('payments').select('id').eq('vendor_id', vendorId);
  const ids = (payments ?? []).map((p) => p.id);
  if (ids.length) {
    await admin.from('refunds').delete().in('payment_id', ids);
    await admin.from('payment_events').delete().in('payment_id', ids);
    await admin.from('payments').delete().in('id', ids);
  }
  await admin.from('reviews').delete().eq('vendor_id', vendorId);
  await admin.from('bookings').delete().eq('vendor_id', vendorId);
  await admin.from('vendor_services').delete().eq('vendor_id', vendorId);
  await admin.from('vendors').delete().eq('id', vendorId);
}

let customer: TestUser;
let vendor: VendorFixture;
let dayCursor = 800;

beforeAll(async () => {
  if (!running) return;
  customer = await createTestUser('p51cust');
  vendor = await createVendor('a');
});

afterAll(async () => {
  if (!running) return;
  if (vendor?.vendorId) await purgeVendor(vendor.vendorId);
  await Promise.all([customer, vendor?.owner].filter(Boolean).map(deleteTestUser));
});

/** A completed booking, which is what makes a review possible. */
async function completedBooking(forVendor: VendorFixture) {
  const { data: booking } = await customer.client.rpc('create_booking', {
    p_vendor_service_id: forVendor.serviceId,
    p_event_date: futureDate(dayCursor++),
    p_event_location: 'Mumbai',
  });
  await forVendor.owner.client.rpc('transition_booking_status', {
    p_booking_id: booking.id,
    p_new_status: 'accepted',
  });
  await forVendor.owner.client.rpc('transition_booking_status', {
    p_booking_id: booking.id,
    p_new_status: 'completed',
  });
  return booking;
}

// ---------------------------------------------------------------------------

describe.runIf(running)('reconciliation scheduling', () => {
  it('the function the cron job runs exists and is callable by service_role', async () => {
    // cron.job is not exposed through PostgREST, so the schedule itself is
    // verified out of band (see docs/OCASIO_OPERATIONS.md). What is asserted
    // here is the thing the job actually invokes.
    const { error } = await serviceClient().rpc('invoke_payment_reconciliation');
    expect(error).toBeNull();
  });

  it('the sweep fails closed and audits when Vault is unconfigured', async () => {
    const admin = serviceClient();

    // Fresh databases have no secrets set, so this is the default state.
    const { data: requestId, error } = await admin.rpc('invoke_payment_reconciliation');
    expect(error).toBeNull();

    if (requestId === null) {
      const { data } = await admin
        .from('audit_log')
        .select('action, metadata')
        .eq('action', 'reconciliation.sweep_skipped')
        .order('created_at', { ascending: false })
        .limit(1);
      expect(data![0].metadata).toMatchObject({ reason: 'vault secrets not configured' });
    } else {
      // Secrets are configured in this environment; the invocation was queued.
      const { data } = await admin
        .from('audit_log')
        .select('action')
        .eq('action', 'reconciliation.sweep_invoked')
        .limit(1);
      expect(data!.length).toBeGreaterThan(0);
    }
  });

  it('no client role can trigger a sweep', async () => {
    const asCustomer = await customer.client.rpc('invoke_payment_reconciliation');
    expect(asCustomer.error).not.toBeNull();
    expect(asCustomer.error!.message).toMatch(/permission denied/i);

    const asVendor = await vendor.owner.client.rpc('invoke_payment_reconciliation');
    expect(asVendor.error).not.toBeNull();

    const asAnon = await anonClient().rpc('invoke_payment_reconciliation');
    expect(asAnon.error).not.toBeNull();
  });

  it('the sweep never leaks the service-role key into the audit log', async () => {
    const { data } = await serviceClient()
      .from('audit_log')
      .select('metadata')
      .like('action', 'reconciliation.%');

    const serialised = JSON.stringify(data ?? []).toLowerCase();
    for (const forbidden of ['bearer', 'service_role', 'eyjhbgci', 'authorization']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('scheduling did not introduce a second reconciliation path', async () => {
    // reconcile_payment remains service_role only — the scheduler calls the
    // edge function, which calls it; nothing else gained access.
    const asCustomer = await customer.client.rpc('reconcile_payment', {
      p_payment_id: '00000000-0000-0000-0000-000000000000',
      p_provider_status: 'succeeded',
      p_reconciliation_ref: key('sched'),
    });
    expect(asCustomer.error).not.toBeNull();
    expect(asCustomer.error!.message).toMatch(/permission denied/i);
  });
});

describe.runIf(running)('rating provenance', () => {
  it('seeded demo vendors are flagged', async () => {
    const { data } = await anonClient()
      .from('vendors')
      .select('rating, review_count, rating_is_demo')
      .eq('slug', 'taj-palace')
      .single();

    expect(data!.rating_is_demo).toBe(true);
    // The figure itself is preserved, so ranking and filtering are unchanged.
    expect(Number(data!.rating)).toBeGreaterThan(0);
  });

  it('a newly onboarded vendor is not flagged and starts at zero', async () => {
    const fresh = await createVendor('fresh');
    try {
      const { data } = await serviceClient()
        .from('vendors')
        .select('rating, review_count, rating_is_demo')
        .eq('id', fresh.vendorId)
        .single();

      expect(data!.rating_is_demo).toBe(false);
      expect(Number(data!.rating)).toBe(0);
      expect(data!.review_count).toBe(0);
    } finally {
      await purgeVendor(fresh.vendorId);
      await deleteTestUser(fresh.owner);
    }
  });

  it('a real review clears the demo flag permanently', async () => {
    const demoVendor = await createVendor('demoflag');
    const admin = serviceClient();
    // Make it look like a seeded vendor.
    await admin
      .from('vendors')
      .update({ rating: 4.8, review_count: 290, rating_is_demo: true })
      .eq('id', demoVendor.vendorId);

    try {
      const booking = await completedBooking(demoVendor);
      await customer.client.rpc('create_review', { p_booking_id: booking.id, p_rating: 3 });

      const { data } = await admin
        .from('vendors')
        .select('rating, review_count, rating_is_demo')
        .eq('id', demoVendor.vendorId)
        .single();

      // The fabricated 4.8 / 290 is replaced by the real aggregate.
      expect(data!.rating_is_demo).toBe(false);
      expect(Number(data!.rating)).toBe(3);
      expect(data!.review_count).toBe(1);
    } finally {
      await purgeVendor(demoVendor.vendorId);
      await deleteTestUser(demoVendor.owner);
    }
  });

  it('no client can set the demo flag', async () => {
    const { error } = await vendor.owner.client
      .from('vendors')
      .update({ rating_is_demo: true })
      .eq('id', vendor.vendorId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/derived from reviews/i);

    const { data } = await serviceClient()
      .from('vendors')
      .select('rating_is_demo')
      .eq('id', vendor.vendorId)
      .single();
    expect(data!.rating_is_demo).toBe(false);
  });

  it('search returns the flag so listings can label a seeded figure', async () => {
    const { data, error } = await anonClient().rpc('search_vendors', { p_limit: 5 });
    expect(error).toBeNull();
    expect(data![0]).toHaveProperty('rating_is_demo');
  });

  it('rating filtering and sorting are unchanged by the flag', async () => {
    const { data } = await anonClient().rpc('search_vendors', {
      p_min_rating: 4.8,
      p_limit: 50,
    });
    // The seeded values are intact, so the Phase 2 behaviour still holds.
    expect((data as { rating: number }[]).length).toBeGreaterThan(0);
    expect((data as { rating: number }[]).every((r) => r.rating >= 4.8)).toBe(true);
  });
});

describe.runIf(running)('account deletion: current behaviour', () => {
  // These pin what happens TODAY. They are not an endorsement of it — see
  // docs/OCASIO_DATA_RETENTION.md for the options and why none was chosen here.

  it('a customer with no history can be deleted', async () => {
    const throwaway = await createTestUser('deletable');
    const admin = serviceClient();

    const { error } = await admin.auth.admin.deleteUser(throwaway.id);
    expect(error).toBeNull();

    const { data } = await admin.from('profiles').select('id').eq('id', throwaway.id);
    expect(data).toEqual([]);
  });

  it('a customer with a booking can still be deleted (bookings cascade)', async () => {
    const throwaway = await createTestUser('booker');
    const admin = serviceClient();

    const { data: booking } = await throwaway.client.rpc('create_booking', {
      p_vendor_service_id: vendor.serviceId,
      p_event_date: futureDate(dayCursor++),
      p_event_location: 'Mumbai',
    });

    const { error } = await admin.auth.admin.deleteUser(throwaway.id);
    expect(error).toBeNull();

    const { data } = await admin.from('bookings').select('id').eq('id', booking.id);
    expect(data).toEqual([]);
  });

  it('a customer who has PAID cannot be deleted', async () => {
    const throwaway = await createTestUser('payer');
    const admin = serviceClient();

    const { data: booking } = await throwaway.client.rpc('create_booking', {
      p_vendor_service_id: vendor.serviceId,
      p_event_date: futureDate(dayCursor++),
      p_event_location: 'Mumbai',
    });
    await vendor.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'accepted',
    });
    const { data: payment } = await throwaway.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('del'),
    });

    // payments.customer_id and payments.booking_id are both ON DELETE RESTRICT.
    const { error } = await admin.auth.admin.deleteUser(throwaway.id);
    expect(error).not.toBeNull();

    // The account survives, intact.
    const { data: stillThere } = await admin.from('profiles').select('id').eq('id', throwaway.id);
    expect(stillThere!.length).toBe(1);

    await admin.from('payment_events').delete().eq('payment_id', payment.id);
    await admin.from('payments').delete().eq('id', payment.id);
    await admin.from('bookings').delete().eq('id', booking.id);
    await admin.auth.admin.deleteUser(throwaway.id);
  });

  it('a customer who has REVIEWED cannot be deleted', async () => {
    const throwaway = await createTestUser('reviewer');
    const admin = serviceClient();

    const { data: booking } = await throwaway.client.rpc('create_booking', {
      p_vendor_service_id: vendor.serviceId,
      p_event_date: futureDate(dayCursor++),
      p_event_location: 'Mumbai',
    });
    await vendor.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'accepted',
    });
    await vendor.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'completed',
    });
    const { data: review } = await throwaway.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 5,
    });

    // reviews.customer_id and reviews.booking_id are ON DELETE RESTRICT.
    const { error } = await admin.auth.admin.deleteUser(throwaway.id);
    expect(error).not.toBeNull();

    const { data: stillThere } = await admin.from('profiles').select('id').eq('id', throwaway.id);
    expect(stillThere!.length).toBe(1);

    await admin.from('reviews').delete().eq('id', review.id);
    await admin.from('bookings').delete().eq('id', booking.id);
    await admin.auth.admin.deleteUser(throwaway.id);
  });

  it('a vendor owner whose vendor has a payment cannot be deleted', async () => {
    const blocked = await createVendor('blocked');
    const admin = serviceClient();

    const { data: booking } = await customer.client.rpc('create_booking', {
      p_vendor_service_id: blocked.serviceId,
      p_event_date: futureDate(dayCursor++),
      p_event_location: 'Mumbai',
    });
    await blocked.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'accepted',
    });
    await customer.client.rpc('create_payment_for_booking', {
      p_booking_id: booking.id,
      p_idempotency_key: key('vdel'),
    });

    // vendors cascade from profiles, but payments.vendor_id restricts.
    const { error } = await admin.auth.admin.deleteUser(blocked.owner.id);
    expect(error).not.toBeNull();

    await purgeVendor(blocked.vendorId);
    await deleteTestUser(blocked.owner);
  });

  it('deleting a reviewer does not silently erase their review', async () => {
    // The point of RESTRICT: the refusal is what protects the record. If this
    // ever becomes a cascade, a vendor's public rating could be rewritten by
    // someone closing their account.
    const throwaway = await createTestUser('erase');
    const admin = serviceClient();

    const { data: booking } = await throwaway.client.rpc('create_booking', {
      p_vendor_service_id: vendor.serviceId,
      p_event_date: futureDate(dayCursor++),
      p_event_location: 'Mumbai',
    });
    await vendor.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'accepted',
    });
    await vendor.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'completed',
    });
    const { data: review } = await throwaway.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 4,
    });

    await admin.auth.admin.deleteUser(throwaway.id);

    const { data } = await admin.from('reviews').select('id, rating').eq('id', review.id);
    expect(data!.length).toBe(1);
    expect(data![0].rating).toBe(4);

    await admin.from('reviews').delete().eq('id', review.id);
    await admin.from('bookings').delete().eq('id', booking.id);
    await admin.auth.admin.deleteUser(throwaway.id);
  });
});
