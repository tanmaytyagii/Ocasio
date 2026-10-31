/**
 * Vendor daily capacity (migration 20261030000002).
 *
 * Real Postgres, real RLS, real locks. Capacity is enforced inside
 * transition_booking_status(), so every test drives that function exactly the
 * way the vendor dashboard does — through PostgREST as the vendor — and then
 * asserts on the rows, not on the absence of an error.
 *
 * The concurrency tests are the point of this file:
 *
 *   - "simultaneous HTTP acceptances" fires many acceptances at once through
 *     PostgREST and checks that exactly `capacity` of them won.
 *   - "a second acceptance waits for the first" is deterministic. It holds one
 *     acceptance open in a real transaction, proves the second is blocked on
 *     the vendor-row lock (pg_stat_activity), then commits and checks the
 *     second is refused. Without the lock the second would not wait — it would
 *     count zero committed bookings and accept. This needs two raw database
 *     connections, which PostgREST cannot provide, hence `pg`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  createTestUser,
  deleteTestUser,
  serviceClient,
  stackIsRunning,
  type TestUser,
} from './helpers/supabase';

const running = await stackIsRunning();

/** The local stack's database, the same one PostgREST serves. */
const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const futureDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

interface VendorFixture {
  owner: TestUser;
  vendorId: string;
  serviceId: string;
}

const vendors: VendorFixture[] = [];
const customers: TestUser[] = [];
let customerSeq = 0;

async function createVendor(label: string): Promise<VendorFixture> {
  const owner = await createTestUser(`capvendor-${label}`);
  const admin = serviceClient();

  const { data: vendor, error } = await owner.client.rpc('request_vendor_onboarding', {
    p_business_name: `Capacity Vendor ${label} ${Date.now()}`,
    p_category: 'Venues',
    p_location: 'Pune',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await admin.from('vendors').update({ status: 'active', starting_price: 50_000 }).eq('id', vendor.id);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: `Hall ${label}`, price: 50_000 })
    .select()
    .single();

  const fixture = { owner, vendorId: vendor.id, serviceId: service!.id };
  vendors.push(fixture);
  return fixture;
}

async function newCustomer(): Promise<TestUser> {
  const customer = await createTestUser(`capcust-${customerSeq++}`);
  customers.push(customer);
  return customer;
}

/** Sets capacity the way a vendor would: an ordinary update on their own row. */
async function setCapacity(vendor: VendorFixture, capacity: number) {
  const { error } = await vendor.owner.client
    .from('vendors')
    .update({ daily_capacity: capacity })
    .eq('id', vendor.vendorId);
  if (error) throw new Error(`capacity update failed: ${error.message}`);
}

/** A pending request from a fresh customer for the given date. */
async function request(vendor: VendorFixture, date: string): Promise<string> {
  const customer = await newCustomer();
  const { data, error } = await customer.client.rpc('create_booking', {
    p_vendor_service_id: vendor.serviceId,
    p_event_date: date,
    p_event_location: 'Koregaon Park, Pune',
  });
  if (error) throw new Error(`booking failed: ${error.message}`);
  return data.id as string;
}

async function transition(user: TestUser, bookingId: string, status: string) {
  return user.client.rpc('transition_booking_status', {
    p_booking_id: bookingId,
    p_new_status: status,
  });
}

async function statusOf(bookingId: string): Promise<string> {
  const { data } = await serviceClient().from('bookings').select('status').eq('id', bookingId).single();
  return data!.status as string;
}

async function acceptedOn(vendor: VendorFixture, date: string): Promise<number> {
  const { count } = await serviceClient()
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_id', vendor.vendorId)
    .eq('event_date', date)
    .in('status', ['accepted', 'completed']);
  return count ?? 0;
}

afterAll(async () => {
  if (!running) return;
  const admin = serviceClient();
  const vendorIds = vendors.map((v) => v.vendorId);
  if (vendorIds.length > 0) {
    await admin.from('bookings').delete().in('vendor_id', vendorIds);
    await admin.from('vendor_services').delete().in('vendor_id', vendorIds);
    await admin.from('vendors').delete().in('id', vendorIds);
  }
  await Promise.all([...customers, ...vendors.map((v) => v.owner)].map(deleteTestUser));
});

describe.runIf(running)('daily capacity is configurable per vendor', () => {
  it('a new vendor can accept one booking a day by default', async () => {
    const vendor = await createVendor('default');
    const { data } = await serviceClient()
      .from('vendors')
      .select('daily_capacity')
      .eq('id', vendor.vendorId)
      .single();
    expect(data!.daily_capacity).toBe(1);
  });

  it('the vendor can raise it, within 1–100', async () => {
    const vendor = await createVendor('range');
    await setCapacity(vendor, 3);

    const { error: tooLow } = await vendor.owner.client
      .from('vendors')
      .update({ daily_capacity: 0 })
      .eq('id', vendor.vendorId);
    expect(tooLow).not.toBeNull();

    const { error: tooHigh } = await vendor.owner.client
      .from('vendors')
      .update({ daily_capacity: 101 })
      .eq('id', vendor.vendorId);
    expect(tooHigh).not.toBeNull();

    const { data } = await serviceClient()
      .from('vendors')
      .select('daily_capacity')
      .eq('id', vendor.vendorId)
      .single();
    expect(data!.daily_capacity).toBe(3);
  });

  it('nobody else can change a vendor\'s capacity', async () => {
    const vendor = await createVendor('owned');
    const other = await createVendor('other');
    const customer = await newCustomer();

    // No UPDATE policy matches, so these silently update zero rows. The row
    // is what proves it.
    await other.owner.client.from('vendors').update({ daily_capacity: 50 }).eq('id', vendor.vendorId);
    await customer.client.from('vendors').update({ daily_capacity: 50 }).eq('id', vendor.vendorId);

    const { data } = await serviceClient()
      .from('vendors')
      .select('daily_capacity')
      .eq('id', vendor.vendorId)
      .single();
    expect(data!.daily_capacity).toBe(1);
  });
});

describe.runIf(running)('capacity is enforced when a booking is accepted', () => {
  it('capacity 1: the second acceptance for the same date is refused', async () => {
    const vendor = await createVendor('cap1');
    const date = futureDate(120);
    const first = await request(vendor, date);
    const second = await request(vendor, date);

    expect((await transition(vendor.owner, first, 'accepted')).error).toBeNull();

    const { error } = await transition(vendor.owner, second, 'accepted');
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/already accepted 1 booking for .* daily limit/i);

    // Refused inside the transaction: still pending, and no history row.
    expect(await statusOf(second)).toBe('pending');
    const { count } = await serviceClient()
      .from('booking_status_history')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', second)
      .eq('to_status', 'accepted');
    expect(count).toBe(0);
    expect(await acceptedOn(vendor, date)).toBe(1);
  });

  it('capacity 2: two are accepted, the third is refused', async () => {
    const vendor = await createVendor('cap2');
    await setCapacity(vendor, 2);
    const date = futureDate(121);
    const [a, b, c] = [await request(vendor, date), await request(vendor, date), await request(vendor, date)];

    expect((await transition(vendor.owner, a, 'accepted')).error).toBeNull();
    expect((await transition(vendor.owner, b, 'accepted')).error).toBeNull();

    const { error } = await transition(vendor.owner, c, 'accepted');
    expect(error!.message).toMatch(/already accepted 2 bookings/i);
    expect(await acceptedOn(vendor, date)).toBe(2);
    expect(await statusOf(c)).toBe('pending');
  });

  it('capacity is per date: a full day does not block another day', async () => {
    const vendor = await createVendor('perdate');
    const full = await request(vendor, futureDate(122));
    const nextDay = await request(vendor, futureDate(123));

    expect((await transition(vendor.owner, full, 'accepted')).error).toBeNull();
    expect((await transition(vendor.owner, nextDay, 'accepted')).error).toBeNull();
  });

  it('different vendors are independent on the same date', async () => {
    const vendorA = await createVendor('indep-a');
    const vendorB = await createVendor('indep-b');
    const date = futureDate(124);

    expect((await transition(vendorA.owner, await request(vendorA, date), 'accepted')).error).toBeNull();
    expect((await transition(vendorB.owner, await request(vendorB, date), 'accepted')).error).toBeNull();
    expect(await acceptedOn(vendorA, date)).toBe(1);
    expect(await acceptedOn(vendorB, date)).toBe(1);
  });

  it('pending requests do not use capacity — any of them can be the one accepted', async () => {
    const vendor = await createVendor('pending');
    const date = futureDate(125);
    await request(vendor, date);
    await request(vendor, date);
    const chosen = await request(vendor, date);

    expect((await transition(vendor.owner, chosen, 'accepted')).error).toBeNull();
  });

  it('a declined request does not use capacity', async () => {
    const vendor = await createVendor('declined');
    const date = futureDate(126);
    const declined = await request(vendor, date);
    const accepted = await request(vendor, date);

    expect((await transition(vendor.owner, declined, 'declined')).error).toBeNull();
    expect((await transition(vendor.owner, accepted, 'accepted')).error).toBeNull();
    expect(await acceptedOn(vendor, date)).toBe(1);
  });

  it('a customer cancelling an accepted booking frees its slot', async () => {
    const vendor = await createVendor('cust-cancel');
    const date = futureDate(127);
    const customer = await newCustomer();
    const { data: booking } = await customer.client.rpc('create_booking', {
      p_vendor_service_id: vendor.serviceId,
      p_event_date: date,
      p_event_location: 'Baner, Pune',
    });
    const waiting = await request(vendor, date);

    expect((await transition(vendor.owner, booking.id, 'accepted')).error).toBeNull();
    expect((await transition(vendor.owner, waiting, 'accepted')).error).not.toBeNull();

    expect((await transition(customer, booking.id, 'cancelled')).error).toBeNull();
    expect((await transition(vendor.owner, waiting, 'accepted')).error).toBeNull();
    expect(await acceptedOn(vendor, date)).toBe(1);
  });

  it('a vendor cancelling an accepted booking frees its slot', async () => {
    const vendor = await createVendor('vend-cancel');
    const date = futureDate(128);
    const first = await request(vendor, date);
    const second = await request(vendor, date);

    expect((await transition(vendor.owner, first, 'accepted')).error).toBeNull();
    expect((await transition(vendor.owner, first, 'cancelled')).error).toBeNull();
    expect((await transition(vendor.owner, second, 'accepted')).error).toBeNull();
  });

  it('a completed booking still counts: the day was used', async () => {
    const vendor = await createVendor('completed');
    const date = futureDate(129);
    const done = await request(vendor, date);
    const late = await request(vendor, date);

    expect((await transition(vendor.owner, done, 'accepted')).error).toBeNull();
    expect((await transition(vendor.owner, done, 'completed')).error).toBeNull();
    expect((await transition(vendor.owner, late, 'accepted')).error).not.toBeNull();
  });

  it('lowering capacity keeps what was accepted and blocks new acceptances', async () => {
    const vendor = await createVendor('lowered');
    await setCapacity(vendor, 2);
    const date = futureDate(130);
    const [a, b, c] = [await request(vendor, date), await request(vendor, date), await request(vendor, date)];
    await transition(vendor.owner, a, 'accepted');
    await transition(vendor.owner, b, 'accepted');

    await setCapacity(vendor, 1);
    expect(await statusOf(a)).toBe('accepted');
    expect(await statusOf(b)).toBe('accepted');
    expect((await transition(vendor.owner, c, 'accepted')).error).not.toBeNull();
  });
});

describe.runIf(running)('concurrent acceptances cannot exceed capacity', () => {
  // Checks the outcome under real concurrent load. On its own it cannot prove
  // the lock exists — PostgREST may happen to run the requests one after
  // another, and with the lock removed this test was seen to pass. The
  // deterministic test below is the one that fails without the lock.
  it('simultaneous HTTP acceptances: exactly `capacity` win', async () => {
    const vendor = await createVendor('burst');
    await setCapacity(vendor, 2);
    const date = futureDate(131);
    const bookingIds: string[] = [];
    for (let i = 0; i < 8; i++) bookingIds.push(await request(vendor, date));

    const results = await Promise.all(bookingIds.map((id) => transition(vendor.owner, id, 'accepted')));

    const accepted = results.filter((r) => r.error === null);
    const refused = results.filter((r) => r.error !== null);
    expect(accepted).toHaveLength(2);
    expect(refused).toHaveLength(6);
    for (const r of refused) expect(r.error!.message).toMatch(/daily limit/i);
    expect(await acceptedOn(vendor, date)).toBe(2);
  });

  describe('a second acceptance waits for the first', () => {
    let db: pg.Client[] = [];

    beforeAll(async () => {
      db = [new pg.Client(DB_URL), new pg.Client(DB_URL), new pg.Client(DB_URL)];
      await Promise.all(db.map((c) => c.connect()));
    });

    afterAll(async () => {
      await Promise.all(db.map((c) => c.end()));
    });

    /** Opens a transaction that PostgREST would have opened for this user. */
    async function beginAs(client: pg.Client, userId: string) {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      await client.query('set local role authenticated');
    }

    /** True once `pid` is blocked waiting on a lock. */
    async function waitingOnLock(observer: pg.Client, pid: number): Promise<boolean> {
      const { rows } = await observer.query(
        'select wait_event_type from pg_stat_activity where pid = $1',
        [pid],
      );
      return rows[0]?.wait_event_type === 'Lock';
    }

    async function race(capacity: number) {
      const vendor = await createVendor(`lock-${capacity}`);
      await setCapacity(vendor, capacity);
      const date = futureDate(140 + capacity);
      const first = await request(vendor, date);
      const second = await request(vendor, date);

      const [t1, t2, observer] = db;
      const { rows } = await t2.query('select pg_backend_pid() as pid');
      const t2pid = rows[0].pid as number;

      // t1 accepts and holds its transaction open: the vendor row stays locked.
      await beginAs(t1, vendor.owner.id);
      await t1.query(`select public.transition_booking_status($1, 'accepted')`, [first]);

      // t2 tries to accept a different booking for the same vendor and date.
      await beginAs(t2, vendor.owner.id);
      const pending = t2
        .query(`select public.transition_booking_status($1, 'accepted')`, [second])
        .then(
          () => ({ ok: true as const, message: '' }),
          (e: Error) => ({ ok: false as const, message: e.message }),
        );

      // It must be blocked on the lock, not racing ahead.
      await expect.poll(() => waitingOnLock(observer, t2pid), { timeout: 5_000 }).toBe(true);

      await t1.query('commit');
      const outcome = await pending;
      await t2.query(outcome.ok ? 'commit' : 'rollback');

      return { vendor, date, first, second, outcome };
    }

    it('capacity 1: it waits, then is refused', async () => {
      const { vendor, date, first, second, outcome } = await race(1);

      expect(outcome.ok).toBe(false);
      expect(outcome.message).toMatch(/daily limit/i);
      expect(await statusOf(first)).toBe('accepted');
      expect(await statusOf(second)).toBe('pending');
      expect(await acceptedOn(vendor, date)).toBe(1);
    });

    it('capacity 2: it waits, then is accepted', async () => {
      const { vendor, date, outcome } = await race(2);

      expect(outcome.ok).toBe(true);
      expect(await acceptedOn(vendor, date)).toBe(2);
    });
  });
});
