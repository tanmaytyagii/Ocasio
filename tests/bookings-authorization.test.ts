/**
 * Booking authorization tests (Phase 3).
 *
 * Real Postgres, real RLS, real functions. These assert on *state*, not on
 * whether an error came back — because with no UPDATE policy on bookings, a
 * malicious update silently matches zero rows and returns success. Asserting
 * "no error" would have passed while proving nothing; asserting "the row did
 * not change" is what actually demonstrates the rule.
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

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

interface VendorFixture {
  owner: TestUser;
  vendorId: string;
  serviceId: string;
  startingPrice: number;
}

/** A fresh approved vendor with one priced service, built the way a real one is. */
async function createVendor(label: string, servicePrice: number | null): Promise<VendorFixture> {
  const owner = await createTestUser(`vendor-${label}`);
  const admin = serviceClient();

  const { data: vendor, error } = await owner.client.rpc('request_vendor_onboarding', {
    p_business_name: `Test Vendor ${label} ${Date.now()}`,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  const startingPrice = 50_000;
  // Approval is a service_role action, as it is in production.
  await admin
    .from('vendors')
    .update({ status: 'active', starting_price: startingPrice })
    .eq('id', vendor.id);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: `Service ${label}`, price: servicePrice })
    .select()
    .single();

  return { owner, vendorId: vendor.id, serviceId: service!.id, startingPrice };
}

let customerA: TestUser;
let customerB: TestUser;
let vendorA: VendorFixture;
let vendorB: VendorFixture;

beforeAll(async () => {
  if (!running) return;
  [customerA, customerB] = await Promise.all([
    createTestUser('cust-a'),
    createTestUser('cust-b'),
  ]);
  vendorA = await createVendor('a', 75_000);
  vendorB = await createVendor('b', null);
});

afterAll(async () => {
  if (!running) return;
  const admin = serviceClient();
  await admin.from('bookings').delete().in('vendor_id', [vendorA.vendorId, vendorB.vendorId]);
  await admin.from('vendors').delete().in('id', [vendorA.vendorId, vendorB.vendorId]);
  await Promise.all(
    [customerA, customerB, vendorA?.owner, vendorB?.owner].filter(Boolean).map(deleteTestUser),
  );
});

/** Requests a booking as the given customer and returns the row. */
async function book(
  customer: TestUser,
  serviceId: string,
  days = 30,
  location = 'Mumbai',
): Promise<{ id: string; status: string; quoted_price: number; customer_id: string; vendor_id: string }> {
  const { data, error } = await customer.client.rpc('create_booking', {
    p_vendor_service_id: serviceId,
    p_event_date: futureDate(days),
    p_event_location: location,
    p_customer_notes: 'Test booking',
  });
  if (error) throw new Error(`create_booking failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------

describe.runIf(running)('booking creation', () => {
  it('a customer can request a booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 31);
    expect(b.status).toBe('pending');
    expect(b.customer_id).toBe(customerA.id);
    expect(b.vendor_id).toBe(vendorA.vendorId);
  });

  it('quoted_price comes from the service price', async () => {
    const b = await book(customerA, vendorA.serviceId, 32);
    expect(b.quoted_price).toBe(75_000);
  });

  it('quoted_price falls back to the vendor starting price when the service has none', async () => {
    const b = await book(customerA, vendorB.serviceId, 33);
    expect(b.quoted_price).toBe(vendorB.startingPrice);
  });

  it('vendor_id is derived from the service, so it cannot be pointed at another vendor', async () => {
    // The RPC has no vendor_id parameter at all. Supplying one is ignored.
    const { data, error } = await customerA.client.rpc('create_booking', {
      p_vendor_service_id: vendorA.serviceId,
      p_event_date: futureDate(34),
      p_event_location: 'Mumbai',
      p_vendor_id: vendorB.vendorId,
      p_customer_id: customerB.id,
      p_quoted_price: 1,
      p_status: 'accepted',
    } as Record<string, unknown>);

    // PostgREST rejects unknown parameters outright; either way nothing is spoofed.
    if (!error) {
      expect(data.vendor_id).toBe(vendorA.vendorId);
      expect(data.customer_id).toBe(customerA.id);
      expect(data.quoted_price).toBe(75_000);
      expect(data.status).toBe('pending');
    } else {
      expect(error.message).toBeTruthy();
    }
  });

  it('a booking cannot start as accepted', async () => {
    const b = await book(customerA, vendorA.serviceId, 35);
    expect(b.status).toBe('pending');
  });

  it('rejects an event date in the past', async () => {
    const { error } = await customerA.client.rpc('create_booking', {
      p_vendor_service_id: vendorA.serviceId,
      p_event_date: futureDate(-1),
      p_event_location: 'Mumbai',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/cannot be in the past/i);
  });

  it('rejects a blank event location', async () => {
    const { error } = await customerA.client.rpc('create_booking', {
      p_vendor_service_id: vendorA.serviceId,
      p_event_date: futureDate(36),
      p_event_location: '   ',
    });
    expect(error).not.toBeNull();
  });

  it('rejects a booking against an inactive service', async () => {
    const admin = serviceClient();
    const { data: svc } = await admin
      .from('vendor_services')
      .insert({ vendor_id: vendorA.vendorId, name: 'Retired service', is_active: false })
      .select()
      .single();

    const { error } = await customerA.client.rpc('create_booking', {
      p_vendor_service_id: svc!.id,
      p_event_date: futureDate(37),
      p_event_location: 'Mumbai',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not accepting bookings/i);

    await admin.from('vendor_services').delete().eq('id', svc!.id);
  });

  it('rejects a booking against a suspended vendor', async () => {
    const admin = serviceClient();
    await admin.from('vendors').update({ status: 'suspended' }).eq('id', vendorB.vendorId);

    const { error } = await customerA.client.rpc('create_booking', {
      p_vendor_service_id: vendorB.serviceId,
      p_event_date: futureDate(38),
      p_event_location: 'Mumbai',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not accepting bookings/i);

    await admin.from('vendors').update({ status: 'active' }).eq('id', vendorB.vendorId);
  });

  it('a vendor cannot book their own listing', async () => {
    const { error } = await vendorA.owner.client.rpc('create_booking', {
      p_vendor_service_id: vendorA.serviceId,
      p_event_date: futureDate(39),
      p_event_location: 'Mumbai',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/your own listing/i);
  });

  it('rejects a duplicate live request for the same service and date', async () => {
    await book(customerB, vendorA.serviceId, 40);
    const { error } = await customerB.client.rpc('create_booking', {
      p_vendor_service_id: vendorA.serviceId,
      p_event_date: futureDate(40),
      p_event_location: 'Mumbai',
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('an anonymous visitor cannot create a booking', async () => {
    const { error } = await anonClient().rpc('create_booking', {
      p_vendor_service_id: vendorA.serviceId,
      p_event_date: futureDate(41),
      p_event_location: 'Mumbai',
    });
    expect(error).not.toBeNull();
  });
});

describe.runIf(running)('direct write attempts are blocked', () => {
  it('a customer cannot INSERT a booking directly', async () => {
    const { error } = await customerA.client.from('bookings').insert({
      customer_id: customerA.id,
      vendor_id: vendorA.vendorId,
      vendor_service_id: vendorA.serviceId,
      event_date: futureDate(50),
      event_location: 'Mumbai',
      quoted_price: 1,
      status: 'accepted',
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('a customer cannot change quoted_price by direct UPDATE', async () => {
    const b = await book(customerA, vendorA.serviceId, 51);

    await customerA.client.from('bookings').update({ quoted_price: 1 }).eq('id', b.id);

    // The update matches no rows rather than failing, so assert the state.
    const { data } = await serviceClient()
      .from('bookings')
      .select('quoted_price')
      .eq('id', b.id)
      .single();
    expect(data!.quoted_price).toBe(75_000);
  });

  it('a customer cannot change status by direct UPDATE', async () => {
    const b = await book(customerA, vendorA.serviceId, 52);

    await customerA.client.from('bookings').update({ status: 'accepted' }).eq('id', b.id);

    const { data } = await serviceClient().from('bookings').select('status').eq('id', b.id).single();
    expect(data!.status).toBe('pending');
  });

  it('a vendor cannot change quoted_price by direct UPDATE', async () => {
    const b = await book(customerA, vendorA.serviceId, 53);

    await vendorA.owner.client.from('bookings').update({ quoted_price: 999 }).eq('id', b.id);

    const { data } = await serviceClient()
      .from('bookings')
      .select('quoted_price')
      .eq('id', b.id)
      .single();
    expect(data!.quoted_price).toBe(75_000);
  });

  it('a customer cannot DELETE a booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 54);

    await customerA.client.from('bookings').delete().eq('id', b.id);

    const { count } = await serviceClient()
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('id', b.id);
    expect(count).toBe(1);
  });
});

describe.runIf(running)('the booking write surface is read-only', () => {
  // bookings carries SELECT policies only; the two SECURITY DEFINER functions
  // are the sole write path. These assert that from the outside: a direct
  // UPDATE from either party changes nothing, on protected and unprotected
  // columns alike.
  it('a customer cannot edit their own booking details after submitting', async () => {
    const b = await book(customerA, vendorA.serviceId, 56);

    await customerA.client
      .from('bookings')
      .update({ event_location: 'Somewhere else', event_date: futureDate(400) })
      .eq('id', b.id);

    const { data } = await serviceClient()
      .from('bookings')
      .select('event_location, event_date')
      .eq('id', b.id)
      .single();
    expect(data!.event_location).toBe('Mumbai');
    expect(data!.event_date).toBe(futureDate(56));
  });

  it('a vendor owner cannot edit booking details directly either', async () => {
    const b = await book(customerA, vendorA.serviceId, 57);

    await vendorA.owner.client
      .from('bookings')
      .update({ event_location: 'Vendor rewrote this', customer_notes: 'tampered' })
      .eq('id', b.id);

    const { data } = await serviceClient()
      .from('bookings')
      .select('event_location, customer_notes')
      .eq('id', b.id)
      .single();
    expect(data!.event_location).toBe('Mumbai');
    expect(data!.customer_notes).toBe('Test booking');
  });
});

describe.runIf(running)('booking visibility', () => {
  it('a customer sees their own bookings', async () => {
    const b = await book(customerA, vendorA.serviceId, 60);
    const { data } = await customerA.client.from('bookings').select('id').eq('id', b.id);
    expect(data!.length).toBe(1);
  });

  it('a customer cannot see another customer\'s booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 61);
    const { data } = await customerB.client.from('bookings').select('id').eq('id', b.id);
    expect(data).toEqual([]);
  });

  it('a vendor owner sees bookings for their vendor', async () => {
    const b = await book(customerA, vendorA.serviceId, 62);
    const { data } = await vendorA.owner.client.from('bookings').select('id').eq('id', b.id);
    expect(data!.length).toBe(1);
  });

  it('a vendor owner cannot see another vendor\'s bookings', async () => {
    const b = await book(customerA, vendorA.serviceId, 63);
    const { data } = await vendorB.owner.client.from('bookings').select('id').eq('id', b.id);
    expect(data).toEqual([]);
  });

  it('an anonymous visitor sees no bookings at all', async () => {
    const { data } = await anonClient().from('bookings').select('id');
    expect(data ?? []).toEqual([]);
  });
});

describe.runIf(running)('status transitions', () => {
  it('a vendor can accept a pending booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 70);
    const { data, error } = await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('accepted');
  });

  it('a vendor can decline a pending booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 71);
    const { data, error } = await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'declined',
      p_note: 'Unavailable that week',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('declined');
  });

  it('a vendor can complete an accepted booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 72);
    await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });
    const { data, error } = await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'completed',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('completed');
  });

  it('a customer can cancel a pending booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 73);
    const { data, error } = await customerA.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'cancelled',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('cancelled');
  });

  it('a customer can cancel an accepted booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 74);
    await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });
    const { data, error } = await customerA.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'cancelled',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('cancelled');
  });

  it('a customer cannot accept their own booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 75);
    const { error } = await customerA.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });
    expect(error).not.toBeNull();

    const { data } = await serviceClient().from('bookings').select('status').eq('id', b.id).single();
    expect(data!.status).toBe('pending');
  });

  it('a customer cannot decline', async () => {
    const b = await book(customerA, vendorA.serviceId, 76);
    const { error } = await customerA.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'declined',
    });
    expect(error).not.toBeNull();
  });

  it('a customer cannot complete', async () => {
    const b = await book(customerA, vendorA.serviceId, 77);
    await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });
    const { error } = await customerA.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'completed',
    });
    expect(error).not.toBeNull();
  });

  it('another vendor cannot act on this vendor\'s booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 78);
    const { error } = await vendorB.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });
    expect(error).not.toBeNull();
    // Deliberately the same message as a missing booking, so the endpoint
    // cannot be used to probe for other people's rows.
    expect(error!.message).toMatch(/not found/i);
  });

  it('another customer cannot cancel someone else\'s booking', async () => {
    const b = await book(customerA, vendorA.serviceId, 79);
    const { error } = await customerB.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'cancelled',
    });
    expect(error).not.toBeNull();

    const { data } = await serviceClient().from('bookings').select('status').eq('id', b.id).single();
    expect(data!.status).toBe('pending');
  });

  it('cannot skip pending and go straight to completed', async () => {
    const b = await book(customerA, vendorA.serviceId, 80);
    const { error } = await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'completed',
    });
    expect(error).not.toBeNull();
  });

  it.each([
    ['declined', 'accepted'],
    ['declined', 'completed'],
    ['cancelled', 'accepted'],
    ['cancelled', 'completed'],
  ])('a %s booking cannot become %s', async (terminal, attempt) => {
    const b = await book(customerA, vendorA.serviceId, 81 + Math.floor(Math.random() * 500));

    if (terminal === 'declined') {
      await vendorA.owner.client.rpc('transition_booking_status', {
        p_booking_id: b.id,
        p_new_status: 'declined',
      });
    } else {
      await customerA.client.rpc('transition_booking_status', {
        p_booking_id: b.id,
        p_new_status: 'cancelled',
      });
    }

    const { error } = await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: attempt,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/cannot change status/i);
  });

  it('a completed booking cannot change again', async () => {
    const b = await book(customerA, vendorA.serviceId, 700);
    await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });
    await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'completed',
    });
    const { error } = await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'cancelled',
    });
    expect(error).not.toBeNull();
  });
});

describe.runIf(running)('status history', () => {
  it('creation records an opening pending row', async () => {
    const b = await book(customerA, vendorA.serviceId, 90);
    const { data } = await customerA.client
      .from('booking_status_history')
      .select('from_status, to_status')
      .eq('booking_id', b.id);

    expect(data!.length).toBe(1);
    expect(data![0].from_status).toBeNull();
    expect(data![0].to_status).toBe('pending');
  });

  it('a valid transition appends a row with the correct from/to', async () => {
    const b = await book(customerA, vendorA.serviceId, 91);
    await vendorA.owner.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
      p_note: 'Happy to help',
    });

    const { data } = await customerA.client
      .from('booking_status_history')
      .select('from_status, to_status, note, changed_by')
      .eq('booking_id', b.id)
      .order('created_at', { ascending: true });

    expect(data!.length).toBe(2);
    expect(data![1].from_status).toBe('pending');
    expect(data![1].to_status).toBe('accepted');
    expect(data![1].note).toBe('Happy to help');
    expect(data![1].changed_by).toBe(vendorA.owner.id);
  });

  it('a rejected transition records nothing', async () => {
    const b = await book(customerA, vendorA.serviceId, 92);
    await customerA.client.rpc('transition_booking_status', {
      p_booking_id: b.id,
      p_new_status: 'accepted',
    });

    const { count } = await serviceClient()
      .from('booking_status_history')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', b.id);
    expect(count).toBe(1);
  });

  it('a user cannot fabricate a history row', async () => {
    const b = await book(customerA, vendorA.serviceId, 93);
    const { error } = await customerA.client.from('booking_status_history').insert({
      booking_id: b.id,
      from_status: 'pending',
      to_status: 'accepted',
      changed_by: customerA.id,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('a user cannot delete history', async () => {
    const b = await book(customerA, vendorA.serviceId, 94);
    await customerA.client.from('booking_status_history').delete().eq('booking_id', b.id);

    const { count } = await serviceClient()
      .from('booking_status_history')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', b.id);
    expect(count).toBe(1);
  });

  it('a user cannot edit history', async () => {
    const b = await book(customerA, vendorA.serviceId, 95);
    await customerA.client
      .from('booking_status_history')
      .update({ to_status: 'completed' })
      .eq('booking_id', b.id);

    const { data } = await serviceClient()
      .from('booking_status_history')
      .select('to_status')
      .eq('booking_id', b.id)
      .single();
    expect(data!.to_status).toBe('pending');
  });

  it('a stranger cannot read a booking\'s history', async () => {
    const b = await book(customerA, vendorA.serviceId, 96);
    const { data } = await customerB.client
      .from('booking_status_history')
      .select('id')
      .eq('booking_id', b.id);
    expect(data).toEqual([]);
  });

  it('the vendor owner can read the history', async () => {
    const b = await book(customerA, vendorA.serviceId, 97);
    const { data } = await vendorA.owner.client
      .from('booking_status_history')
      .select('id')
      .eq('booking_id', b.id);
    expect(data!.length).toBe(1);
  });
});
