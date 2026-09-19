/**
 * Review authorization and rating-aggregate tests (Phase 5).
 *
 * Real Postgres, real RLS, real triggers.
 *
 * As in the booking and payment suites, these assert on *state* rather than on
 * whether an error came back: reviews has no UPDATE or DELETE policy, so a
 * malicious statement silently matches zero rows and returns success.
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

interface VendorFixture {
  owner: TestUser;
  vendorId: string;
  serviceId: string;
}

async function createVendor(label: string): Promise<VendorFixture> {
  const owner = await createTestUser(`revvendor-${label}`);
  const admin = serviceClient();

  const { data: vendor, error } = await owner.client.rpc('request_vendor_onboarding', {
    p_business_name: `Review Vendor ${label} ${Date.now()}`,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await admin.from('vendors').update({ status: 'active', starting_price: 50_000 }).eq('id', vendor.id);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: `Svc ${label}`, price: 70_000 })
    .select()
    .single();

  return { owner, vendorId: vendor.id, serviceId: service!.id };
}

let customerA: TestUser;
let customerB: TestUser;
let vendorA: VendorFixture;
let vendorB: VendorFixture;
let dayCursor = 400;

beforeAll(async () => {
  if (!running) return;
  [customerA, customerB] = await Promise.all([
    createTestUser('revcust-a'),
    createTestUser('revcust-b'),
  ]);
  vendorA = await createVendor('a');
  vendorB = await createVendor('b');
});

afterAll(async () => {
  if (!running) return;
  const admin = serviceClient();
  const vendorIds = [vendorA?.vendorId, vendorB?.vendorId].filter(Boolean) as string[];
  if (vendorIds.length === 0) return;

  // Reviews reference bookings and vendors with ON DELETE RESTRICT, so they go
  // first. Leaving fixture vendors behind would add them to the public
  // catalogue and break the marketplace tests' exact counts.
  await admin.from('reviews').delete().in('vendor_id', vendorIds);
  await admin.from('bookings').delete().in('vendor_id', vendorIds);
  await admin.from('vendor_services').delete().in('vendor_id', vendorIds);
  await admin.from('vendors').delete().in('id', vendorIds);

  await Promise.all(
    [customerA, customerB, vendorA?.owner, vendorB?.owner].filter(Boolean).map(deleteTestUser),
  );
});

/** A booking in the requested state, for the given customer. */
async function bookingInState(
  customer: TestUser,
  vendor: VendorFixture,
  state: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed',
) {
  const { data: booking, error } = await customer.client.rpc('create_booking', {
    p_vendor_service_id: vendor.serviceId,
    p_event_date: futureDate(dayCursor++),
    p_event_location: 'Mumbai',
  });
  if (error) throw new Error(`booking failed: ${error.message}`);
  if (state === 'pending') return booking;

  if (state === 'declined') {
    await vendor.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'declined',
    });
    return booking;
  }
  if (state === 'cancelled') {
    await customer.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'cancelled',
    });
    return booking;
  }

  await vendor.owner.client.rpc('transition_booking_status', {
    p_booking_id: booking.id,
    p_new_status: 'accepted',
  });
  if (state === 'accepted') return booking;

  await vendor.owner.client.rpc('transition_booking_status', {
    p_booking_id: booking.id,
    p_new_status: 'completed',
  });
  return booking;
}

const vendorAggregate = async (vendorId: string) =>
  (
    await serviceClient().from('vendors').select('rating, review_count').eq('id', vendorId).single()
  ).data!;

// ---------------------------------------------------------------------------

describe.runIf(running)('review eligibility', () => {
  it('a customer can review their completed booking', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { data, error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 5,
      p_body: 'Excellent from start to finish',
    });
    expect(error).toBeNull();
    expect(data.rating).toBe(5);
    expect(data.vendor_id).toBe(vendorA.vendorId);
    expect(data.customer_id).toBe(customerA.id);
  });

  it.each(['pending', 'accepted', 'declined', 'cancelled'] as const)(
    'a %s booking cannot be reviewed',
    async (state) => {
      const booking = await bookingInState(customerA, vendorA, state);
      const { error } = await customerA.client.rpc('create_review', {
        p_booking_id: booking.id,
        p_rating: 5,
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/only review a booking once it has been completed/i);
    },
  );

  it('a customer cannot review another customer\'s booking', async () => {
    const booking = await bookingInState(customerB, vendorA, 'completed');
    const { error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 1,
    });
    expect(error).not.toBeNull();
    // Same message as a missing booking, so it cannot be used to probe.
    expect(error!.message).toMatch(/not found/i);

    const { count } = await serviceClient()
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', booking.id);
    expect(count).toBe(0);
  });

  it('a booking cannot be reviewed twice', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const first = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 4,
    });
    expect(first.error).toBeNull();

    const second = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 1,
    });
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe('23505');

    const { count } = await serviceClient()
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', booking.id);
    expect(count).toBe(1);
  });

  it('an anonymous visitor cannot create a review', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await anonClient().rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 5,
    });
    expect(error).not.toBeNull();
  });

  it('a nonexistent booking cannot be reviewed', async () => {
    const { error } = await customerA.client.rpc('create_review', {
      p_booking_id: '00000000-0000-0000-0000-000000000000',
      p_rating: 5,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found/i);
  });
});

describe.runIf(running)('the client cannot forge review associations', () => {
  it('vendor_id and customer_id are derived, not supplied', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { data, error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 5,
      p_vendor_id: vendorB.vendorId,
      p_customer_id: customerB.id,
    } as Record<string, unknown>);

    // PostgREST rejects unknown parameters; if it did not, nothing is forged.
    if (!error) {
      expect(data.vendor_id).toBe(vendorA.vendorId);
      expect(data.customer_id).toBe(customerA.id);
    } else {
      expect(error.message).toBeTruthy();
    }
  });

  it('a customer cannot INSERT a review directly', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await customerA.client.from('reviews').insert({
      booking_id: booking.id,
      customer_id: customerA.id,
      vendor_id: vendorA.vendorId,
      rating: 5,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('a vendor cannot manufacture a review for themselves', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await vendorA.owner.client.from('reviews').insert({
      booking_id: booking.id,
      customer_id: vendorA.owner.id,
      vendor_id: vendorA.vendorId,
      rating: 5,
    });
    expect(error).not.toBeNull();

    const { count } = await serviceClient()
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', booking.id);
    expect(count).toBe(0);
  });

  it('a vendor cannot review through the function either', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await vendorA.owner.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 5,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found/i);
  });
});

describe.runIf(running)('rating bounds and text validation', () => {
  it.each([0, 6, -1, 100])('a rating of %s is rejected', async (rating) => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: rating,
    });
    expect(error).not.toBeNull();
  });

  it('a null rating is rejected', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: null,
    });
    expect(error).not.toBeNull();
  });

  it('a whitespace-only body is stored as null rather than blank', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { data, error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 4,
      p_body: '     ',
    });
    expect(error).toBeNull();
    expect(data.body).toBeNull();
  });

  it('an over-long body is rejected by the database', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 4,
      p_body: 'x'.repeat(2001),
    });
    expect(error).not.toBeNull();
  });

  it('a one-character body is rejected', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    const { error } = await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 4,
      p_body: 'x',
    });
    expect(error).not.toBeNull();
  });
});

describe.runIf(running)('reviews are immutable', () => {
  it('a customer cannot edit their own review', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    await customerA.client.rpc('create_review', { p_booking_id: booking.id, p_rating: 2 });

    await customerA.client.from('reviews').update({ rating: 5 }).eq('booking_id', booking.id);

    const { data } = await serviceClient()
      .from('reviews')
      .select('rating')
      .eq('booking_id', booking.id)
      .single();
    expect(data!.rating).toBe(2);
  });

  it('a customer cannot delete their own review', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    await customerA.client.rpc('create_review', { p_booking_id: booking.id, p_rating: 3 });

    await customerA.client.from('reviews').delete().eq('booking_id', booking.id);

    const { count } = await serviceClient()
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', booking.id);
    expect(count).toBe(1);
  });

  it('a vendor cannot delete a review of their own business', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    await customerA.client.rpc('create_review', { p_booking_id: booking.id, p_rating: 1 });

    await vendorA.owner.client.from('reviews').delete().eq('booking_id', booking.id);

    const { data } = await serviceClient()
      .from('reviews')
      .select('rating')
      .eq('booking_id', booking.id)
      .single();
    expect(data!.rating).toBe(1);
  });
});

describe.runIf(running)('review visibility', () => {
  it('reviews are publicly readable', async () => {
    const booking = await bookingInState(customerA, vendorA, 'completed');
    await customerA.client.rpc('create_review', {
      p_booking_id: booking.id,
      p_rating: 5,
      p_body: 'Publicly visible',
    });

    const { data, error } = await anonClient()
      .from('reviews')
      .select('id, vendor_id, rating, body, created_at')
      .eq('booking_id', booking.id);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it('customer_id is not readable by anon', async () => {
    const { error } = await anonClient().from('reviews').select('customer_id').limit(1);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('customer_id is not readable by an authenticated user either', async () => {
    const { error } = await customerB.client.from('reviews').select('customer_id').limit(1);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('select(*) is denied because it would include customer_id', async () => {
    const { error } = await anonClient().from('reviews').select('*').limit(1);
    expect(error).not.toBeNull();
  });
});

describe.runIf(running)('rating aggregates', () => {
  it('a vendor with no reviews reports 0 and 0', async () => {
    const fresh = await createVendor('fresh');
    const agg = await vendorAggregate(fresh.vendorId);
    expect(Number(agg.rating)).toBe(0);
    expect(agg.review_count).toBe(0);

    const admin = serviceClient();
    await admin.from('vendor_services').delete().eq('vendor_id', fresh.vendorId);
    await admin.from('vendors').delete().eq('id', fresh.vendorId);
    await deleteTestUser(fresh.owner);
  });

  it('the aggregate is the mean of review ratings, to one decimal', async () => {
    const vendor = await createVendor('agg');

    const leave = async (rating: number) => {
      const { data: booking } = await customerA.client.rpc('create_booking', {
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
      const { error } = await customerA.client.rpc('create_review', {
        p_booking_id: booking.id,
        p_rating: rating,
      });
      if (error) throw new Error(error.message);
    };

    await leave(4);
    expect(await vendorAggregate(vendor.vendorId)).toMatchObject({ rating: 4, review_count: 1 });

    await leave(5);
    expect(await vendorAggregate(vendor.vendorId)).toMatchObject({ rating: 4.5, review_count: 2 });

    await leave(3);
    expect(await vendorAggregate(vendor.vendorId)).toMatchObject({ rating: 4, review_count: 3 });

    // 4+5+3+5 = 17/4 = 4.25, rounded to one decimal.
    await leave(5);
    expect(await vendorAggregate(vendor.vendorId)).toMatchObject({ rating: 4.3, review_count: 4 });

    const admin = serviceClient();
    await admin.from('reviews').delete().eq('vendor_id', vendor.vendorId);
    await admin.from('bookings').delete().eq('vendor_id', vendor.vendorId);
    await admin.from('vendor_services').delete().eq('vendor_id', vendor.vendorId);
    await admin.from('vendors').delete().eq('id', vendor.vendorId);
    await deleteTestUser(vendor.owner);
  });

  it('removing reviews recomputes, and an emptied vendor returns to 0 and 0', async () => {
    const vendor = await createVendor('recompute');
    const admin = serviceClient();

    const bookingIds: string[] = [];
    for (const rating of [5, 1]) {
      const { data: booking } = await customerA.client.rpc('create_booking', {
        p_vendor_service_id: vendor.serviceId,
        p_event_date: futureDate(dayCursor++),
        p_event_location: 'Mumbai',
      });
      bookingIds.push(booking.id);
      await vendor.owner.client.rpc('transition_booking_status', {
        p_booking_id: booking.id,
        p_new_status: 'accepted',
      });
      await vendor.owner.client.rpc('transition_booking_status', {
        p_booking_id: booking.id,
        p_new_status: 'completed',
      });
      await customerA.client.rpc('create_review', { p_booking_id: booking.id, p_rating: rating });
    }
    expect(await vendorAggregate(vendor.vendorId)).toMatchObject({ rating: 3, review_count: 2 });

    // DELETE is not reachable from a client; the trigger still has to be right.
    await admin.from('reviews').delete().eq('booking_id', bookingIds[1]);
    expect(await vendorAggregate(vendor.vendorId)).toMatchObject({ rating: 5, review_count: 1 });

    await admin.from('reviews').delete().eq('vendor_id', vendor.vendorId);
    const empty = await vendorAggregate(vendor.vendorId);
    expect(Number(empty.rating)).toBe(0);
    expect(empty.review_count).toBe(0);

    await admin.from('bookings').delete().eq('vendor_id', vendor.vendorId);
    await admin.from('vendor_services').delete().eq('vendor_id', vendor.vendorId);
    await admin.from('vendors').delete().eq('id', vendor.vendorId);
    await deleteTestUser(vendor.owner);
  });

  it('a vendor cannot set their own rating or review_count', async () => {
    const before = await vendorAggregate(vendorA.vendorId);

    const { error } = await vendorA.owner.client
      .from('vendors')
      .update({ rating: 5, review_count: 9999 })
      .eq('id', vendorA.vendorId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/derived from reviews/i);

    const after = await vendorAggregate(vendorA.vendorId);
    expect(after.rating).toBe(before.rating);
    expect(after.review_count).toBe(before.review_count);
  });

  it('a customer cannot set a vendor\'s rating either', async () => {
    const before = await vendorAggregate(vendorA.vendorId);

    await customerA.client
      .from('vendors')
      .update({ rating: 1, review_count: 0 })
      .eq('id', vendorA.vendorId);

    const after = await vendorAggregate(vendorA.vendorId);
    expect(after.rating).toBe(before.rating);
    expect(after.review_count).toBe(before.review_count);
  });
});
