/**
 * Razorpay payments, end to end on the server side (migration 20261030000001
 * and the payments-create-order / payments-webhook / payments-refund handlers).
 *
 * Real Postgres, real RLS, real locks and constraints. The handlers run in
 * this process exactly as the edge functions run them — the Deno entry points
 * only read the environment and call them. The one stand-in is Razorpay
 * itself: an in-memory fake that follows Razorpay's documented behaviour,
 * including that a refund `receipt` is an idempotency key.
 *
 * Webhooks are delivered as Razorpay delivers them: a JSON body signed with
 * HMAC-SHA256 over the raw bytes, with x-razorpay-event-id.
 *
 * As elsewhere, assertions are on rows, not on the absence of an error.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  stackIsRunning,
  type TestUser,
} from './helpers/supabase';
import { supabaseDb } from '../supabase/functions/_shared/db.ts';
import { handleCreateOrder } from '../supabase/functions/_shared/createOrder.ts';
import { handleRefund } from '../supabase/functions/_shared/refund.ts';
import { handleWebhook } from '../supabase/functions/_shared/webhook.ts';
import { RATE_LIMITS, type RateLimit, spendRateLimit } from '../supabase/functions/_shared/rateLimit.ts';
import type { Db } from '../supabase/functions/_shared/db.ts';
import {
  RazorpayError,
  hmacSha256Hex,
  type RazorpayApi,
  type RazorpayOrder,
  type RazorpayRefund,
} from '../supabase/functions/_shared/razorpay.ts';

const running = await stackIsRunning();

/** The local stack's database — for the one test that needs two raw transactions. */
const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const KEY_ID = 'rzp_test_OcasioFake01';
const WEBHOOK_SECRET = 'whsec-test-ocasio-0123456789';
const SERVICE_PRICE = 40_000; // rupees
const AMOUNT_MINOR = SERVICE_PRICE * 100;

/**
 * The shared fixtures make far more payment calls in one run than any person
 * would, so the suite gives them a large budget. The real limits are tested on
 * fresh users in 'request budgets' below.
 */
const HARNESS_LIMIT: RateLimit = { max: 10_000, windowSeconds: 600 };

const db = supabaseDb((url, key, options) => createClient(url, key, options), {
  url: SUPABASE_URL,
  anonKey: ANON_KEY,
  serviceRoleKey: SERVICE_ROLE_KEY,
});

// ---------------------------------------------------------------------------
// Razorpay stand-in
// ---------------------------------------------------------------------------

const token = () =>
  `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.replace(/[^A-Za-z0-9]/g, 'x');

class FakeRazorpay implements RazorpayApi {
  orders: RazorpayOrder[] = [];
  refunds: RazorpayRefund[] = [];
  calls = { createOrder: 0, findOrderByReceipt: 0, createRefund: 0, findRefundByReceipt: 0 };

  /** Next createOrder throws this. */
  failNextOrder: RazorpayError | null = null;
  /** Added to the amount of orders it creates — a Razorpay that disagrees. */
  orderAmountDelta = 0;
  /** Next createRefund: refused, unreachable, or applied and THEN timed out. */
  nextRefund: 'reject' | 'unavailable' | 'apply-then-timeout' | null = null;

  async createOrder(input: { amount: number; currency: string; receipt: string }) {
    this.calls.createOrder++;
    if (this.failNextOrder) {
      const error = this.failNextOrder;
      this.failNextOrder = null;
      throw error;
    }
    if (this.orders.some((o) => o.receipt === input.receipt)) {
      throw new RazorpayError('duplicate', 400, 'Duplicate receipt found for this order request.');
    }
    const order = {
      id: `order_${token()}`,
      amount: input.amount + this.orderAmountDelta,
      currency: input.currency,
      receipt: input.receipt,
      status: 'created',
    };
    this.orders.push(order);
    return order;
  }

  async findOrderByReceipt(receipt: string) {
    this.calls.findOrderByReceipt++;
    return this.orders.find((o) => o.receipt === receipt) ?? null;
  }

  async createRefund(paymentId: string, input: { amount: number; receipt: string }) {
    this.calls.createRefund++;
    const mode = this.nextRefund;
    this.nextRefund = null;
    if (mode === 'reject') {
      throw new RazorpayError('rejected', 400, 'The refund amount provided is greater than amount captured.');
    }
    if (mode === 'unavailable') throw new RazorpayError('retryable', 503, 'Service unavailable');
    if (this.refunds.some((r) => r.receipt === input.receipt)) {
      throw new RazorpayError('duplicate', 400, 'Duplicate receipt found for this refund request.');
    }
    const refund = {
      id: `rfnd_${token()}`,
      payment_id: paymentId,
      amount: input.amount,
      currency: 'INR',
      receipt: input.receipt,
      status: 'pending',
    };
    this.refunds.push(refund);
    if (mode === 'apply-then-timeout') {
      throw new RazorpayError('retryable', 0, 'Razorpay could not be reached: The operation timed out.');
    }
    return refund;
  }

  async findRefundByReceipt(paymentId: string, receipt: string) {
    this.calls.findRefundByReceipt++;
    return this.refunds.find((r) => r.payment_id === paymentId && r.receipt === receipt) ?? null;
  }
}

let razorpay: FakeRazorpay;
beforeEach(() => {
  razorpay = new FakeRazorpay();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface VendorFixture {
  owner: TestUser;
  vendorId: string;
  serviceId: string;
}

let customer: TestUser;
let otherCustomer: TestUser;
let vendor: VendorFixture;
let otherVendor: VendorFixture;
/** A vendor of its own, so its refund budget starts untouched. */
let budgetVendor: VendorFixture | undefined;
let dayCursor = 200;

const futureDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function createVendor(label: string, price: number): Promise<VendorFixture> {
  const owner = await createTestUser(`rzpvendor-${label}`);
  const admin = serviceClient();
  const { data: v, error } = await owner.client.rpc('request_vendor_onboarding', {
    p_business_name: `Razorpay Vendor ${label} ${Date.now()}`,
    p_category: 'Catering',
    p_location: 'Delhi',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);
  await admin.from('vendors').update({ status: 'active', starting_price: price }).eq('id', v.id);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);
  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: v.id, name: `Feast ${label}`, price })
    .select()
    .single();
  return { owner, vendorId: v.id, serviceId: service!.id };
}

beforeAll(async () => {
  if (!running) return;
  [customer, otherCustomer] = await Promise.all([
    createTestUser('rzpcust-a'),
    createTestUser('rzpcust-b'),
  ]);
  vendor = await createVendor('a', SERVICE_PRICE);
  otherVendor = await createVendor('b', 25_000);
});

afterAll(async () => {
  if (!running) return;
  const admin = serviceClient();
  const vendorIds = [vendor?.vendorId, otherVendor?.vendorId, budgetVendor?.vendorId].filter(Boolean) as string[];

  // Payments and refunds RESTRICT deletes, so children first.
  const { data: payments } = await admin.from('payments').select('id').in('vendor_id', vendorIds);
  const paymentIds = (payments ?? []).map((p) => p.id);
  if (paymentIds.length > 0) {
    await admin.from('refunds').delete().in('payment_id', paymentIds);
    await admin.from('payment_events').delete().in('payment_id', paymentIds);
    await admin.from('payments').delete().in('id', paymentIds);
  }
  await admin.from('payment_events').delete().like('provider_event_id', 'itest_%');
  await admin.from('bookings').delete().in('vendor_id', vendorIds);
  await admin.from('vendor_services').delete().in('vendor_id', vendorIds);
  await admin.from('vendors').delete().in('id', vendorIds);
  await Promise.all(
    [customer, otherCustomer, vendor?.owner, otherVendor?.owner, budgetVendor?.owner]
      .filter((u): u is TestUser => Boolean(u))
      .map(deleteTestUser),
  );
});

async function acceptedBooking(forVendor: VendorFixture = vendor, by: TestUser = customer): Promise<string> {
  const { data: booking, error } = await by.client.rpc('create_booking', {
    p_vendor_service_id: forVendor.serviceId,
    p_event_date: futureDate(dayCursor++),
    p_event_location: 'Hauz Khas, Delhi',
  });
  if (error) throw new Error(`booking failed: ${error.message}`);
  const { error: tErr } = await forVendor.owner.client.rpc('transition_booking_status', {
    p_booking_id: booking.id,
    p_new_status: 'accepted',
  });
  if (tErr) throw new Error(`accept failed: ${tErr.message}`);
  return booking.id;
}

async function bearerFor(user: TestUser): Promise<string> {
  const { data } = await user.client.auth.getSession();
  return `Bearer ${data.session!.access_token}`;
}

async function call(
  handler: (req: Request) => Promise<Response>,
  body: unknown,
  authorization?: string | null,
) {
  const response = await handler(
    new Request('http://localhost/fn', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown>, raw: response };
}

const createOrder = async (bookingId: string, as: TestUser | null = customer, extra: object = {}) =>
  call(
    (req) => handleCreateOrder(req, { db, razorpay, keyId: KEY_ID, rateLimit: HARNESS_LIMIT }),
    { booking_id: bookingId, ...extra },
    as ? await bearerFor(as) : null,
  );

const requestRefund = async (
  paymentId: string,
  amountMinor: number,
  key: string,
  as: TestUser | null = vendor.owner,
) =>
  call(
    (req) => handleRefund(req, { db, razorpay, rateLimit: HARNESS_LIMIT }),
    { payment_id: paymentId, amount_minor: amountMinor, idempotency_key: key, reason: 'Test refund' },
    as ? await bearerFor(as) : null,
  );

let eventSeq = 0;
const eventId = () => `itest_${Date.now()}_${eventSeq++}`;

async function deliver(
  body: unknown,
  options: { id?: string; secret?: string | null; signature?: string; configured?: boolean } = {},
) {
  const raw = JSON.stringify(body);
  const signature = options.signature ?? (await hmacSha256Hex(options.secret ?? WEBHOOK_SECRET, raw));
  const response = await handleWebhook(
    new Request('http://localhost/payments-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': options.id ?? eventId(),
      },
      body: raw,
    }),
    { db, webhookSecret: options.configured === false ? null : WEBHOOK_SECRET },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const paymentEvent = (
  event: 'payment.captured' | 'payment.failed',
  orderId: string,
  paymentId: string,
  amount = AMOUNT_MINOR,
  currency = 'INR',
) => ({
  entity: 'event',
  account_id: 'acc_TestOcasio01',
  event,
  contains: ['payment'],
  payload: {
    payment: {
      entity: {
        id: paymentId,
        entity: 'payment',
        amount,
        currency,
        status: event === 'payment.captured' ? 'captured' : 'failed',
        order_id: orderId,
        method: 'card',
        captured: event === 'payment.captured',
        email: 'customer@example.com',
        contact: '+919000090000',
        card: { last4: '1111', network: 'Visa' },
        error_code: event === 'payment.failed' ? 'BAD_REQUEST_ERROR' : null,
        error_reason: event === 'payment.failed' ? 'payment_failed' : null,
        error_description: event === 'payment.failed' ? 'Payment failed due to incorrect OTP.' : null,
      },
    },
  },
  created_at: Math.floor(Date.now() / 1000),
});

const refundEvent = (
  event: 'refund.processed' | 'refund.failed',
  refund: { id: string; payment_id: string; amount: number; receipt: string | null },
  orderId: string | null,
) => ({
  entity: 'event',
  account_id: 'acc_TestOcasio01',
  event,
  contains: ['refund', 'payment'],
  payload: {
    refund: {
      entity: {
        id: refund.id,
        entity: 'refund',
        amount: refund.amount,
        currency: 'INR',
        payment_id: refund.payment_id,
        notes: refund.receipt ? { ocasio_refund_id: refund.receipt } : [],
        receipt: refund.receipt,
        status: event === 'refund.processed' ? 'processed' : 'failed',
      },
    },
    payment: { entity: { id: refund.payment_id, entity: 'payment', order_id: orderId, captured: true } },
  },
  created_at: Math.floor(Date.now() / 1000),
});

async function paymentRow(id: string) {
  const { data } = await serviceClient().from('payments').select('*').eq('id', id).single();
  return data!;
}

async function paymentForBooking(bookingId: string) {
  const { data } = await serviceClient().from('payments').select('*').eq('booking_id', bookingId);
  return data ?? [];
}

async function refundRows(paymentId: string) {
  const { data } = await serviceClient()
    .from('refunds')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

async function eventRows(providerEventId: string) {
  const { data } = await serviceClient()
    .from('payment_events')
    .select('*')
    .eq('provider', 'razorpay')
    .eq('provider_event_id', providerEventId);
  return data ?? [];
}

async function auditActions(entityId: string) {
  const { data } = await serviceClient().from('audit_log').select('action').eq('entity_id', entityId);
  return (data ?? []).map((r) => r.action as string);
}

/** A booking whose Razorpay payment has been captured and recorded. */
async function paidBooking() {
  const bookingId = await acceptedBooking();
  const { body } = await createOrder(bookingId);
  const providerPaymentId = `pay_${token()}`;
  const delivered = await deliver(paymentEvent('payment.captured', body.order_id as string, providerPaymentId));
  expect(delivered.status).toBe(200);
  const payment = await paymentRow(body.payment_id as string);
  expect(payment.status).toBe('succeeded');
  return { bookingId, payment, orderId: body.order_id as string, providerPaymentId };
}

// ===========================================================================
// payments-create-order
// ===========================================================================

describe.runIf(running)('creating a Razorpay order', () => {
  it('creates one order for the server-side price and returns only what Checkout needs', async () => {
    const bookingId = await acceptedBooking();
    const { status, body, raw } = await createOrder(bookingId);

    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['amount_minor', 'currency', 'key_id', 'order_id', 'payment_id']);
    expect(body).toMatchObject({ amount_minor: AMOUNT_MINOR, currency: 'INR', key_id: KEY_ID });
    expect(raw.headers.get('access-control-allow-origin')).toBe('*');

    expect(razorpay.calls.createOrder).toBe(1);
    expect(razorpay.orders[0]).toMatchObject({
      id: body.order_id,
      amount: AMOUNT_MINOR,
      currency: 'INR',
      receipt: body.payment_id,
    });

    const payment = await paymentRow(body.payment_id as string);
    expect(payment).toMatchObject({
      booking_id: bookingId,
      customer_id: customer.id,
      provider: 'razorpay',
      provider_order_id: body.order_id,
      status: 'processing',
      amount_minor: AMOUNT_MINOR,
    });
    expect(payment.processing_since).not.toBeNull();
    expect(await auditActions(payment.id)).toEqual(
      expect.arrayContaining(['payment.created', 'payment.order_created', 'payment.initiated']),
    );
  });

  it('ignores an amount sent by the browser', async () => {
    const bookingId = await acceptedBooking();
    const { status, body } = await createOrder(bookingId, customer, { amount_minor: 100, currency: 'USD' });

    expect(status).toBe(200);
    expect(body.amount_minor).toBe(AMOUNT_MINOR);
    expect(razorpay.orders[0].amount).toBe(AMOUNT_MINOR);
    expect(razorpay.orders[0].currency).toBe('INR');
  });

  it('refuses a request with no session or a forged token, before touching Razorpay', async () => {
    const bookingId = await acceptedBooking();

    expect((await createOrder(bookingId, null)).status).toBe(401);
    const forged = await call(
      (req) => handleCreateOrder(req, { db, razorpay, keyId: KEY_ID, rateLimit: HARNESS_LIMIT }),
      { booking_id: bookingId },
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.c2lnbmF0dXJl',
    );
    expect(forged.status).toBe(401);
    expect(razorpay.calls.createOrder).toBe(0);
    expect(await paymentForBooking(bookingId)).toHaveLength(0);
  });

  it('refuses another customer\'s booking with the same answer as a missing one', async () => {
    const bookingId = await acceptedBooking();
    const theirs = await createOrder(bookingId, otherCustomer);
    const missing = await createOrder('00000000-0000-4000-8000-000000000000');

    expect(theirs.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(theirs.body.error).toBe(missing.body.error);
    expect(razorpay.calls.createOrder).toBe(0);
    expect(await paymentForBooking(bookingId)).toHaveLength(0);
  });

  it('refuses a malformed booking id', async () => {
    expect((await createOrder('not-a-uuid')).status).toBe(400);
  });

  it('refuses a booking the vendor has not accepted', async () => {
    const { data: booking } = await customer.client.rpc('create_booking', {
      p_vendor_service_id: vendor.serviceId,
      p_event_date: futureDate(dayCursor++),
      p_event_location: 'Saket, Delhi',
    });
    const { status, body } = await createOrder(booking.id);

    expect(status).toBe(409);
    expect(body.error).toMatch(/not ready for payment/i);
    expect(razorpay.calls.createOrder).toBe(0);
  });

  it('refuses an invalid amount: a ₹0 booking never reaches Razorpay', async () => {
    const admin = serviceClient();
    const { data: free } = await admin
      .from('vendor_services')
      .insert({ vendor_id: vendor.vendorId, name: 'Free tasting', price: 0 })
      .select()
      .single();
    const { data: booking } = await customer.client.rpc('create_booking', {
      p_vendor_service_id: free!.id,
      p_event_date: futureDate(dayCursor++),
      p_event_location: 'Saket, Delhi',
    });
    await vendor.owner.client.rpc('transition_booking_status', {
      p_booking_id: booking.id,
      p_new_status: 'accepted',
    });

    const { status } = await createOrder(booking.id);
    expect(status).toBe(422);
    expect(razorpay.calls.createOrder).toBe(0);
    expect(await paymentForBooking(booking.id)).toHaveLength(0);
  });

  it('refuses to attach an order whose amount Razorpay reports differently', async () => {
    const bookingId = await acceptedBooking();
    razorpay.orderAmountDelta = -100;

    const { status } = await createOrder(bookingId);
    expect(status).toBe(502);

    const [payment] = await paymentForBooking(bookingId);
    expect(payment.provider_order_id).toBeNull();
    expect(payment.status).toBe('pending');
  });

  it('a repeated request returns the same order — no second order is created', async () => {
    const bookingId = await acceptedBooking();
    const first = await createOrder(bookingId);
    const second = await createOrder(bookingId);

    expect(second.status).toBe(200);
    expect(second.body.order_id).toBe(first.body.order_id);
    expect(second.body.payment_id).toBe(first.body.payment_id);
    expect(razorpay.calls.createOrder).toBe(1);
    expect(await paymentForBooking(bookingId)).toHaveLength(1);
  });

  it('simultaneous requests end with one payment and one recorded order', async () => {
    const bookingId = await acceptedBooking();
    const results = await Promise.all([createOrder(bookingId), createOrder(bookingId), createOrder(bookingId)]);

    for (const r of results) expect(r.status).toBe(200);
    const orderIds = new Set(results.map((r) => r.body.order_id));
    expect(orderIds.size).toBe(1);

    const payments = await paymentForBooking(bookingId);
    expect(payments).toHaveLength(1);
    expect(payments[0].provider_order_id).toBe(results[0].body.order_id);
    // Razorpay enforces receipt uniqueness, so even the race created one order.
    expect(razorpay.orders.filter((o) => o.receipt === payments[0].id)).toHaveLength(1);
  });

  it('reuses an order that was created but never recorded (a crash in between)', async () => {
    const bookingId = await acceptedBooking();
    const { data: payment } = await customer.client.rpc('begin_razorpay_payment', { p_booking_id: bookingId });
    const orphan = await razorpay.createOrder({ amount: AMOUNT_MINOR, currency: 'INR', receipt: payment.id });

    const { status, body } = await createOrder(bookingId);
    expect(status).toBe(200);
    expect(body.order_id).toBe(orphan.id);
    expect(razorpay.calls.createOrder).toBe(1);
  });

  it('a Razorpay outage leaves nothing half-done, and the next attempt succeeds', async () => {
    const bookingId = await acceptedBooking();
    razorpay.failNextOrder = new RazorpayError('retryable', 503, 'Service unavailable');

    expect((await createOrder(bookingId)).status).toBe(502);
    const [pending] = await paymentForBooking(bookingId);
    expect(pending.status).toBe('pending');
    expect(pending.provider_order_id).toBeNull();

    const retried = await createOrder(bookingId);
    expect(retried.status).toBe(200);
    expect((await paymentRow(pending.id)).provider_order_id).toBe(retried.body.order_id);
  });

  it('fails closed when Razorpay credentials are not configured', async () => {
    const bookingId = await acceptedBooking();
    const { status } = await call(
      (req) => handleCreateOrder(req, { db, razorpay: null, keyId: null, rateLimit: HARNESS_LIMIT }),
      { booking_id: bookingId },
      await bearerFor(customer),
    );
    expect(status).toBe(503);
  });

  it('a paid booking cannot open another order', async () => {
    const { bookingId } = await paidBooking();
    const { status, body } = await createOrder(bookingId);
    expect(status).toBe(409);
    expect(body.error).toMatch(/already been paid/i);
  });

  it('after a failed attempt, paying again reopens the same order', async () => {
    const bookingId = await acceptedBooking();
    const first = await createOrder(bookingId);
    await deliver(paymentEvent('payment.failed', first.body.order_id as string, `pay_${token()}`));
    expect((await paymentRow(first.body.payment_id as string)).status).toBe('failed');

    const again = await createOrder(bookingId);
    expect(again.body.order_id).toBe(first.body.order_id);
    expect((await paymentRow(first.body.payment_id as string)).status).toBe('processing');
    expect(razorpay.calls.createOrder).toBe(1);
  });

  it('after the customer abandons an attempt, paying again reopens the same order', async () => {
    const bookingId = await acceptedBooking();
    const first = await createOrder(bookingId);
    await customer.client.rpc('cancel_payment', { p_payment_id: first.body.payment_id });
    expect((await paymentRow(first.body.payment_id as string)).status).toBe('cancelled');

    const again = await createOrder(bookingId);
    expect(again.body.order_id).toBe(first.body.order_id);
    expect(await paymentForBooking(bookingId)).toHaveLength(1);
  });

  it('the browser cannot attach an order, start a Razorpay payment, or open a second one', async () => {
    const bookingId = await acceptedBooking();
    // Pending, no order yet: the one state in which start_payment's status
    // rules would let it through, so only the Razorpay guard stands in the way.
    const { data: pending } = await customer.client.rpc('begin_razorpay_payment', { p_booking_id: bookingId });

    const start = await customer.client.rpc('start_payment', {
      p_payment_id: pending.id,
      p_provider_payment_id: 'pay_ATTACKER0001',
    });
    expect(start.error?.message).toMatch(/started by the checkout service/i);

    const attach = await customer.client.rpc('prepare_razorpay_checkout', {
      p_payment_id: pending.id,
      p_customer_id: customer.id,
      p_order_id: 'order_ATTACKER0001',
      p_order_amount_minor: 100,
      p_order_currency: 'INR',
    });
    expect(attach.error).not.toBeNull();

    let row = await paymentRow(pending.id);
    expect(row).toMatchObject({ status: 'pending', provider_order_id: null, provider_payment_id: null });

    // Cancelled is not "live", so only the one-per-booking rule stops a second.
    await customer.client.rpc('cancel_payment', { p_payment_id: pending.id });
    const second = await customer.client.rpc('create_payment_for_booking', {
      p_booking_id: bookingId,
      p_idempotency_key: `rogue-${token()}`,
      p_provider: 'razorpay',
    });
    expect(second.error).not.toBeNull();

    expect(await paymentForBooking(bookingId)).toHaveLength(1);
    row = await paymentRow(pending.id);
    expect(row.provider_payment_id).toBeNull();
  });
});

// ===========================================================================
// payments-webhook — payments
// ===========================================================================

describe.runIf(running)('Razorpay payment webhooks', () => {
  it('refuses an invalid signature and changes nothing', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const id = eventId();

    const forged = await deliver(paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`), {
      id,
      secret: 'attacker-guess',
    });
    expect(forged.status).toBe(401);
    expect((await paymentRow(body.payment_id as string)).status).toBe('processing');
    expect(await eventRows(id)).toHaveLength(0);
  });

  it('refuses every delivery when no webhook secret is configured', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const result = await deliver(paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`), {
      configured: false,
    });
    expect(result.status).toBe(503);
    expect((await paymentRow(body.payment_id as string)).status).toBe('processing');
  });

  it('a verified payment.captured is the one thing that marks a payment paid', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const providerPaymentId = `pay_${token()}`;
    const id = eventId();

    const result = await deliver(paymentEvent('payment.captured', body.order_id as string, providerPaymentId), { id });
    expect(result).toEqual({ status: 200, body: { received: true } });

    const payment = await paymentRow(body.payment_id as string);
    expect(payment.status).toBe('succeeded');
    expect(payment.provider_payment_id).toBe(providerPaymentId);

    const [event] = await eventRows(id);
    expect(event.processed_at).not.toBeNull();
    expect(event.payment_id).toBe(payment.id);
    expect(await auditActions(payment.id)).toContain('payment.succeeded');
  });

  it('stores no customer contact or card details from the payload', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const id = eventId();
    await deliver(paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`), { id });

    const stored = JSON.stringify((await eventRows(id))[0].payload);
    expect(stored).not.toContain('customer@example.com');
    expect(stored).not.toContain('+919000090000');
    expect(stored).not.toContain('last4');
  });

  it('a duplicate delivery of the same event is a no-op', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const event = paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`);
    const id = eventId();

    expect((await deliver(event, { id })).status).toBe(200);
    expect((await deliver(event, { id })).status).toBe(200);

    expect(await eventRows(id)).toHaveLength(1);
    const audits = (await auditActions(body.payment_id as string)).filter((a) => a === 'payment.succeeded');
    expect(audits).toHaveLength(1);
  });

  it('the same capture arriving under a second event id settles once', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const event = paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`);

    await deliver(event);
    const second = eventId();
    await deliver(event, { id: second });

    expect((await eventRows(second))[0].processing_error).toBe('capture already applied');
    const audits = (await auditActions(body.payment_id as string)).filter((a) => a === 'payment.succeeded');
    expect(audits).toHaveLength(1);
  });

  it('payment.failed marks the attempt failed and leaves the booking accepted', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);

    const result = await deliver(paymentEvent('payment.failed', body.order_id as string, `pay_${token()}`));
    expect(result.status).toBe(200);

    expect((await paymentRow(body.payment_id as string)).status).toBe('failed');
    const { data: booking } = await serviceClient().from('bookings').select('status').eq('id', bookingId).single();
    expect(booking!.status).toBe('accepted');
  });

  it('a failure reported after the capture cannot unsettle it', async () => {
    const { payment, orderId } = await paidBooking();
    await deliver(paymentEvent('payment.failed', orderId, `pay_${token()}`));
    expect((await paymentRow(payment.id)).status).toBe('succeeded');
  });

  it('a capture after a failed attempt — a retry in the same Checkout — settles it', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    await deliver(paymentEvent('payment.failed', body.order_id as string, `pay_${token()}`));
    const retry = `pay_${token()}`;
    await deliver(paymentEvent('payment.captured', body.order_id as string, retry));

    const payment = await paymentRow(body.payment_id as string);
    expect(payment.status).toBe('succeeded');
    expect(payment.provider_payment_id).toBe(retry);
  });

  it('a failure redelivered after the customer reopened Checkout does not fail the new attempt', async () => {
    // Out of order and duplicated at once: attempt 1 fails, the customer
    // reopens the same order, then Razorpay redelivers attempt 1's failure.
    // Only the replay guard tells the two apart — the state alone does not.
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const failure = paymentEvent('payment.failed', body.order_id as string, `pay_${token()}`);
    const id = eventId();

    await deliver(failure, { id });
    await createOrder(bookingId);
    expect((await paymentRow(body.payment_id as string)).status).toBe('processing');

    await deliver(failure, { id });
    expect((await paymentRow(body.payment_id as string)).status).toBe('processing');
  });

  it('the database refuses a mismatched order on its own, not only in the function', async () => {
    const bookingId = await acceptedBooking();
    const { data: payment } = await customer.client.rpc('begin_razorpay_payment', { p_booking_id: bookingId });

    const { error } = await serviceClient().rpc('prepare_razorpay_checkout', {
      p_payment_id: payment.id,
      p_customer_id: customer.id,
      p_order_id: `order_${token()}`,
      p_order_amount_minor: 100,
      p_order_currency: 'INR',
    });
    expect(error?.message).toMatch(/does not match this payment/i);
    expect((await paymentRow(payment.id)).provider_order_id).toBeNull();
  });

  it('a capture whose amount does not match is recorded and not applied', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const id = eventId();

    await deliver(paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`, 100), { id });

    expect((await paymentRow(body.payment_id as string)).status).toBe('processing');
    expect((await eventRows(id))[0].processing_error).toBe('amount or currency mismatch');
    expect(await auditActions(body.payment_id as string)).toContain('payment.verification_failed');
  });

  it('a capture in another currency is recorded and not applied', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    await deliver(paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`, AMOUNT_MINOR, 'USD'));
    expect((await paymentRow(body.payment_id as string)).status).toBe('processing');
  });

  it('money captured after the customer abandoned the attempt is recorded and flagged', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    await customer.client.rpc('cancel_payment', { p_payment_id: body.payment_id });

    await deliver(paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`));

    expect((await paymentRow(body.payment_id as string)).status).toBe('succeeded');
    expect(await auditActions(body.payment_id as string)).toContain('payment.needs_review');
  });

  it('an order Ocasio did not create is recorded and acknowledged, so Razorpay stops retrying', async () => {
    const id = eventId();
    const result = await deliver(paymentEvent('payment.captured', `order_${token()}`, `pay_${token()}`), { id });

    expect(result).toEqual({ status: 200, body: { ignored: 'no matching payment' } });
    const [event] = await eventRows(id);
    expect(event.processing_error).toBe('no matching payment');
    expect(event.processed_at).toBeNull();
  });

  it('event types Ocasio does not use are acknowledged and not recorded', async () => {
    const id = eventId();
    const result = await deliver({ entity: 'event', event: 'order.paid', payload: {} }, { id });
    expect(result).toEqual({ status: 200, body: { ignored: 'order.paid' } });
    expect(await eventRows(id)).toHaveLength(0);
  });

  it('a signed event with the wrong shape is refused, not guessed at', async () => {
    const malformed = paymentEvent('payment.captured', `order_${token()}`, `pay_${token()}`);
    (malformed.payload.payment.entity as Record<string, unknown>).amount = '40000';
    expect((await deliver(malformed)).status).toBe(400);
  });

  it('no browser can call the webhook functions directly', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);

    const attempt = await customer.client.rpc('process_razorpay_payment_event', {
      p_event_id: eventId(),
      p_event_type: 'payment.captured',
      p_order_id: body.order_id,
      p_provider_payment_id: `pay_${token()}`,
      p_amount_minor: AMOUNT_MINOR,
      p_currency: 'INR',
      p_signature_verified: true,
      p_payload: {},
    });
    expect(attempt.error).not.toBeNull();
    expect((await paymentRow(body.payment_id as string)).status).toBe('processing');
  });
});

// ===========================================================================
// payments-refund and refund webhooks
// ===========================================================================

describe.runIf(running)('Razorpay refunds', () => {
  let keySeq = 0;
  const refundKey = (label: string) => `refund:${label}:${Date.now()}:${keySeq++}`;

  it('a vendor\'s full refund is sent to Razorpay and completes only on refund.processed', async () => {
    const { payment } = await paidBooking();
    const { status, body } = await requestRefund(payment.id, AMOUNT_MINOR, refundKey('full'));

    expect(status).toBe(202);
    expect(razorpay.calls.createRefund).toBe(1);
    const [sent] = razorpay.refunds;
    expect(sent).toMatchObject({ payment_id: payment.provider_payment_id, amount: AMOUNT_MINOR });

    const [refund] = await refundRows(payment.id);
    expect(sent.receipt).toBe(refund.id);
    expect(body.refund).toMatchObject({ id: refund.id, status: 'pending', provider_refund_id: sent.id });

    // Accepted by Razorpay is not refunded.
    expect(refund.status).toBe('pending');
    expect((await paymentRow(payment.id)).status).toBe('succeeded');

    const result = await deliver(refundEvent('refund.processed', sent, null));
    expect(result.status).toBe(200);

    expect((await refundRows(payment.id))[0].status).toBe('succeeded');
    const settled = await paymentRow(payment.id);
    expect(settled.status).toBe('refunded');
    expect(settled.amount_refunded_minor).toBe(AMOUNT_MINOR);
  });

  it('partial refunds add up, and the payment is refunded once they reach the total', async () => {
    const { payment } = await paidBooking();
    const part = AMOUNT_MINOR / 4;

    await requestRefund(payment.id, part, refundKey('part1'));
    await deliver(refundEvent('refund.processed', razorpay.refunds[0], null));
    let row = await paymentRow(payment.id);
    expect(row.status).toBe('partially_refunded');
    expect(row.amount_refunded_minor).toBe(part);

    await requestRefund(payment.id, AMOUNT_MINOR - part, refundKey('part2'));
    await deliver(refundEvent('refund.processed', razorpay.refunds[1], null));
    row = await paymentRow(payment.id);
    expect(row.status).toBe('refunded');
    expect(row.amount_refunded_minor).toBe(AMOUNT_MINOR);
  });

  it('refund.failed fails the refund and releases its amount', async () => {
    const { payment } = await paidBooking();
    await requestRefund(payment.id, AMOUNT_MINOR, refundKey('willfail'));
    await deliver(refundEvent('refund.failed', razorpay.refunds[0], null));

    const [refund] = await refundRows(payment.id);
    expect(refund.status).toBe('failed');
    const row = await paymentRow(payment.id);
    expect(row.status).toBe('succeeded');
    expect(row.amount_refunded_minor).toBe(0);

    // The full amount can be requested again.
    expect((await requestRefund(payment.id, AMOUNT_MINOR, refundKey('again'))).status).toBe(202);
  });

  it('a request Razorpay refuses is marked failed, not completed, and frees the amount', async () => {
    const { payment } = await paidBooking();
    razorpay.nextRefund = 'reject';

    const { status, body } = await requestRefund(payment.id, AMOUNT_MINOR, refundKey('reject'));
    expect(status).toBe(422);
    expect(body.refund).toMatchObject({ status: 'failed', provider_refund_id: null });
    expect(razorpay.refunds).toHaveLength(0);
    expect((await paymentRow(payment.id)).status).toBe('succeeded');
    expect((await requestRefund(payment.id, AMOUNT_MINOR, refundKey('retry'))).status).toBe(202);
  });

  it('when Razorpay is unreachable the refund is kept, and resending it is safe', async () => {
    const { payment } = await paidBooking();
    const key = refundKey('outage');
    razorpay.nextRefund = 'unavailable';

    expect((await requestRefund(payment.id, AMOUNT_MINOR, key)).status).toBe(503);
    let [refund] = await refundRows(payment.id);
    expect(refund).toMatchObject({ status: 'pending', provider_refund_id: null, provider_submitted_at: null });

    const resent = await requestRefund(payment.id, AMOUNT_MINOR, key);
    expect(resent.status).toBe(202);
    [refund] = await refundRows(payment.id);
    expect(refund.provider_refund_id).toBe(razorpay.refunds[0].id);
    expect(razorpay.refunds).toHaveLength(1);
    expect(await refundRows(payment.id)).toHaveLength(1);
  });

  it('a timeout after Razorpay applied the refund does not refund twice', async () => {
    const { payment } = await paidBooking();
    razorpay.nextRefund = 'apply-then-timeout';

    const { status } = await requestRefund(payment.id, AMOUNT_MINOR, refundKey('timeout'));

    // The receipt finds the refund the timed-out request created.
    expect(status).toBe(202);
    expect(razorpay.refunds).toHaveLength(1);
    const [refund] = await refundRows(payment.id);
    expect(refund.provider_refund_id).toBe(razorpay.refunds[0].id);
  });

  it('the same refund request sent twice refunds once', async () => {
    const { payment } = await paidBooking();
    const key = refundKey('dup');

    const first = await requestRefund(payment.id, AMOUNT_MINOR / 2, key);
    const second = await requestRefund(payment.id, AMOUNT_MINOR / 2, key);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect((second.body.refund as { id: string }).id).toBe((first.body.refund as { id: string }).id);
    expect(razorpay.calls.createRefund).toBe(1);
    expect(await refundRows(payment.id)).toHaveLength(1);
  });

  it('the same refund request sent simultaneously reaches Razorpay once', async () => {
    const { payment } = await paidBooking();
    const key = refundKey('burst');

    const results = await Promise.all([
      requestRefund(payment.id, AMOUNT_MINOR, key),
      requestRefund(payment.id, AMOUNT_MINOR, key),
      requestRefund(payment.id, AMOUNT_MINOR, key),
    ]);
    for (const r of results) expect(r.status).toBe(202);
    expect(razorpay.refunds).toHaveLength(1);
    expect(await refundRows(payment.id)).toHaveLength(1);
  });

  it('a second request with the same key waits for the first, then gets its refund', async () => {
    // Deterministic, unlike firing HTTP requests together: t1 holds the payment
    // lock with its refund inserted but uncommitted; t2 is shown to be waiting
    // on that lock, then must return t1's refund rather than fail on the
    // unique key. This is the re-check in create_refund_record().
    const { payment } = await paidBooking();
    const key = refundKey('locked');
    const [t1, t2, observer] = [new pg.Client(DB_URL), new pg.Client(DB_URL), new pg.Client(DB_URL)];
    await Promise.all([t1, t2, observer].map((c) => c.connect()));

    try {
      const sql = 'select (public.create_razorpay_refund($1, $2, $3, $4)).id as id';
      const args = [vendor.owner.id, payment.id, AMOUNT_MINOR, key];
      const { rows } = await t2.query('select pg_backend_pid() as pid');
      const t2pid = rows[0].pid as number;

      await t1.query('begin');
      await t1.query('set local role service_role');
      const first = await t1.query(sql, args);

      await t2.query('begin');
      await t2.query('set local role service_role');
      const second = t2.query(sql, args).then(
        (r) => ({ id: r.rows[0].id as string, error: null as string | null }),
        (e: Error) => ({ id: null as string | null, error: e.message }),
      );

      await expect
        .poll(async () => {
          const { rows: activity } = await observer.query(
            'select wait_event_type from pg_stat_activity where pid = $1',
            [t2pid],
          );
          return activity[0]?.wait_event_type;
        }, { timeout: 5_000 })
        .toBe('Lock');

      await t1.query('commit');
      const outcome = await second;
      await t2.query(outcome.error ? 'rollback' : 'commit');

      expect(outcome.error).toBeNull();
      expect(outcome.id).toBe(first.rows[0].id);
      expect(await refundRows(payment.id)).toHaveLength(1);
    } finally {
      await Promise.all([t1, t2, observer].map((c) => c.end()));
    }
  });

  it('a pending refund reserves its amount: requests cannot add up to more than was paid', async () => {
    const { payment } = await paidBooking();
    expect((await requestRefund(payment.id, AMOUNT_MINOR, refundKey('reserve'))).status).toBe(202);

    const over = await requestRefund(payment.id, 100, refundKey('over'));
    expect(over.status).toBe(409);
    expect(over.body.error).toMatch(/exceeds the refundable balance/i);
    expect(razorpay.calls.createRefund).toBe(1);
  });

  it('only the vendor who owns the booking (or an admin) can refund', async () => {
    const { payment } = await paidBooking();

    const byCustomer = await requestRefund(payment.id, 100, refundKey('cust'), customer);
    const byOtherVendor = await requestRefund(payment.id, 100, refundKey('other'), otherVendor.owner);
    const anonymous = await requestRefund(payment.id, 100, refundKey('anon'), null);

    expect(byCustomer.status).toBe(404);
    expect(byOtherVendor.status).toBe(404);
    expect(anonymous.status).toBe(401);
    expect(razorpay.calls.createRefund).toBe(0);
    expect(await refundRows(payment.id)).toHaveLength(0);
  });

  it('rejects malformed refund requests before touching the database', async () => {
    const { payment } = await paidBooking();
    expect((await requestRefund(payment.id, 99, refundKey('tiny'))).status).toBe(400);
    expect((await requestRefund(payment.id, 100.5, refundKey('frac'))).status).toBe(400);
    expect((await requestRefund(payment.id, 1_000, 'short')).status).toBe(400);
    expect((await requestRefund('nope', 1_000, refundKey('id'))).status).toBe(400);
    expect(await refundRows(payment.id)).toHaveLength(0);
  });

  it('the browser cannot refund a Razorpay payment through the old RPC, or reach the service functions', async () => {
    const { payment } = await paidBooking();

    const viaRpc = await vendor.owner.client.rpc('refund_payment', {
      p_payment_id: payment.id,
      p_amount_minor: 1_000,
      p_idempotency_key: refundKey('rpc'),
    });
    expect(viaRpc.error).not.toBeNull();

    const direct = await vendor.owner.client.rpc('create_razorpay_refund', {
      p_actor_id: vendor.owner.id,
      p_payment_id: payment.id,
      p_amount_minor: 1_000,
      p_idempotency_key: refundKey('direct'),
    });
    expect(direct.error).not.toBeNull();
    expect(await refundRows(payment.id)).toHaveLength(0);
  });

  it('a refund webhook that overtakes the API response is matched by its receipt', async () => {
    const { payment } = await paidBooking();
    razorpay.nextRefund = 'unavailable';
    await requestRefund(payment.id, AMOUNT_MINOR, refundKey('overtake'));
    const [saved] = await refundRows(payment.id);
    expect(saved.provider_refund_id).toBeNull();

    // Razorpay did process it; the webhook arrives before Ocasio recorded it.
    const rfnd = { id: `rfnd_${token()}`, payment_id: payment.provider_payment_id, amount: AMOUNT_MINOR, receipt: saved.id };
    expect((await deliver(refundEvent('refund.processed', rfnd, null))).status).toBe(200);

    const [refund] = await refundRows(payment.id);
    expect(refund).toMatchObject({ status: 'succeeded', provider_refund_id: rfnd.id });
    expect((await paymentRow(payment.id)).status).toBe('refunded');
  });

  it('a duplicate refund webhook does not credit twice', async () => {
    const { payment } = await paidBooking();
    await requestRefund(payment.id, AMOUNT_MINOR / 2, refundKey('dupweb'));
    const event = refundEvent('refund.processed', razorpay.refunds[0], null);
    const id = eventId();

    await deliver(event, { id });
    await deliver(event, { id });
    await deliver(event); // the same refund under a new event id

    const row = await paymentRow(payment.id);
    expect(row.amount_refunded_minor).toBe(AMOUNT_MINOR / 2);
    expect(row.status).toBe('partially_refunded');
  });

  it('a refund issued from the Razorpay Dashboard is recorded, not ignored', async () => {
    const { payment } = await paidBooking();
    const external = { id: `rfnd_${token()}`, payment_id: payment.provider_payment_id, amount: 10_000, receipt: null };

    expect((await deliver(refundEvent('refund.processed', external, null))).status).toBe(200);

    const [refund] = await refundRows(payment.id);
    expect(refund).toMatchObject({ status: 'succeeded', provider_refund_id: external.id, amount_minor: 10_000 });
    expect((await paymentRow(payment.id)).status).toBe('partially_refunded');
  });

  it('a refund event that disagrees with the request is not applied', async () => {
    const { payment } = await paidBooking();
    await requestRefund(payment.id, AMOUNT_MINOR, refundKey('mismatch'));
    const sent = razorpay.refunds[0];
    const id = eventId();

    await deliver(refundEvent('refund.processed', { ...sent, amount: 100 }, null), { id });

    expect((await refundRows(payment.id))[0].status).toBe('pending');
    expect((await eventRows(id))[0].processing_error).toBe('refund does not match the recorded request');
  });

  it('a refund for a payment Ocasio does not know is acknowledged and ignored', async () => {
    const stranger = { id: `rfnd_${token()}`, payment_id: `pay_${token()}`, amount: 5_000, receipt: null };
    const result = await deliver(refundEvent('refund.processed', stranger, `order_${token()}`));
    expect(result).toEqual({ status: 200, body: { ignored: 'nothing to apply' } });
  });

  it('a refund that overtakes its own capture is retried later, not dropped', async () => {
    const bookingId = await acceptedBooking();
    const { body } = await createOrder(bookingId);
    const early = { id: `rfnd_${token()}`, payment_id: `pay_${token()}`, amount: 5_000, receipt: null };

    const result = await deliver(refundEvent('refund.processed', early, body.order_id as string));
    expect(result.status).toBe(503);
    expect(await refundRows(body.payment_id as string)).toHaveLength(0);
  });
});

// ===========================================================================
// Audit trail
// ===========================================================================

describe.runIf(running)('the audit trail cannot be written from outside', () => {
  it('anonymous and signed-in callers cannot execute write_audit()', async () => {
    const marker = `forged-${Date.now()}`;
    const anonymous = await anonClient().rpc('write_audit', {
      p_action: 'refund.succeeded',
      p_entity_type: 'refund',
      p_entity_id: null,
      p_metadata: { marker },
    });
    const signedIn = await customer.client.rpc('write_audit', {
      p_action: 'refund.succeeded',
      p_entity_type: 'refund',
      p_entity_id: null,
      p_metadata: { marker },
    });

    expect(anonymous.error).not.toBeNull();
    expect(signedIn.error).not.toBeNull();
    const { count } = await serviceClient()
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('metadata->>marker', marker);
    expect(count).toBe(0);
  });
});

// ===========================================================================
// Request budgets (SECURITY_AUDIT F-17)
// ===========================================================================

describe.runIf(running)('request budgets', () => {
  const fresh: TestUser[] = [];

  afterAll(async () => {
    const ids = [...fresh.map((u) => u.id), budgetVendor?.owner.id].filter(Boolean) as string[];
    const admin = serviceClient();
    for (const id of ids) {
      await admin.from('rate_limit_counters').delete().like('bucket', `%:${id}`);
    }
    // Payments of the fresh customers belong to the shared vendor; the main
    // afterAll removes them with the vendor's other rows.
    await Promise.all(fresh.map(deleteTestUser));
  });

  it('a customer who keeps calling create-order is refused with 429 and Retry-After, and Razorpay is not called again', async () => {
    const { max, windowSeconds } = RATE_LIMITS['payments-create-order'];
    const someone = await createTestUser('rzp-budget-cust');
    fresh.push(someone);
    const bookingId = await acceptedBooking(vendor, someone);
    const auth = await bearerFor(someone);
    const send = () => call((req) => handleCreateOrder(req, { db, razorpay, keyId: KEY_ID }), { booking_id: bookingId }, auth);

    for (let i = 0; i < max; i++) expect((await send()).status).toBe(200);
    const refused = await send();

    expect(refused.status).toBe(429);
    const retryAfter = Number(refused.raw.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(windowSeconds);
    expect(refused.raw.headers.get('access-control-expose-headers')).toBe('retry-after');
    // One order for all of it: the retries reopened it, the refusal never reached Razorpay.
    expect(razorpay.calls.createOrder).toBe(1);
    expect(razorpay.calls.findOrderByReceipt).toBe(1);

    // The budget is per person: someone else is unaffected.
    const other = await createTestUser('rzp-budget-other');
    fresh.push(other);
    const theirs = await acceptedBooking(vendor, other);
    const ok = await call(
      (req) => handleCreateOrder(req, { db, razorpay, keyId: KEY_ID }),
      { booking_id: theirs },
      await bearerFor(other),
    );
    expect(ok.status).toBe(200);
  });

  it('a vendor cannot split a payment into an unlimited number of refunds', async () => {
    const { max } = RATE_LIMITS['payments-refund'];
    budgetVendor = await createVendor('budget', SERVICE_PRICE);
    const bookingId = await acceptedBooking(budgetVendor, customer);
    const { body } = await createOrder(bookingId);
    const captured = await deliver(paymentEvent('payment.captured', body.order_id as string, `pay_${token()}`));
    expect(captured.status).toBe(200);
    const paymentId = body.payment_id as string;
    const auth = await bearerFor(budgetVendor.owner);
    const send = (i: number) =>
      call(
        (req) => handleRefund(req, { db, razorpay }),
        { payment_id: paymentId, amount_minor: 100, idempotency_key: `budget:${paymentId}:${i}`, reason: 'Test refund' },
        auth,
      );

    // 202: a submitted refund is pending until refund.processed.
    for (let i = 0; i < max; i++) {
      const accepted = await send(i);
      expect(accepted.status).toBe(202);
      expect(accepted.body.submitted).toBe(true);
    }
    const refused = await send(max);

    expect(refused.status).toBe(429);
    expect(Number(refused.raw.headers.get('retry-after'))).toBeGreaterThan(0);
    // Exactly the allowed requests reached Razorpay, and the refused one left no row.
    expect(razorpay.calls.createRefund).toBe(max);
    expect((await refundRows(paymentId)).length).toBe(max);
  });

  it('only the service role can spend a budget, and no client can read the counters', async () => {
    const args = { p_bucket: `payments-refund:${customer.id}`, p_max: 1, p_window_seconds: 60 };
    const anonymous = await anonClient().rpc('consume_rate_limit', args);
    const signedIn = await customer.client.rpc('consume_rate_limit', args);
    // Refused at the function, not merely by the table underneath it: with an
    // EXECUTE grant the body would fail later on the table, which hides a
    // regression in the grant itself.
    expect(anonymous.error?.message).toMatch(/permission denied for function consume_rate_limit/i);
    expect(signedIn.error?.message).toMatch(/permission denied for function consume_rate_limit/i);
    const pgc = new pg.Client(DB_URL);
    await pgc.connect();
    try {
      const { rows } = await pgc.query(
        `select r, has_function_privilege(r, 'public.consume_rate_limit(text,integer,integer)', 'execute') as can
           from unnest(array['anon', 'authenticated', 'service_role']) r`,
      );
      expect(Object.fromEntries(rows.map((x) => [x.r, x.can]))).toEqual({ anon: false, authenticated: false, service_role: true });
    } finally {
      await pgc.end();
    }

    const read = await customer.client.from('rate_limit_counters').select('*');
    expect(read.data ?? []).toEqual([]);
  });

  it('budgets are separate for each user and each kind of request', async () => {
    const one = { max: 1, windowSeconds: 600 };
    const a = `itest-a-${Date.now()}`;
    const b = `itest-b-${Date.now()}`;
    try {
      expect(await spendRateLimit(db, 'payments-create-order', a, one)).toBeNull();
      expect((await spendRateLimit(db, 'payments-create-order', a, one))?.status).toBe(429);
      // Same person, other kind of request: its own budget.
      expect(await spendRateLimit(db, 'payments-refund', a, one)).toBeNull();
      // Same kind of request, other person: their own budget.
      expect(await spendRateLimit(db, 'payments-create-order', b, one)).toBeNull();
    } finally {
      await serviceClient().from('rate_limit_counters').delete().or(`bucket.like.%:${a},bucket.like.%:${b}`);
    }
  });

  it('Retry-After is the time left in the current window', async () => {
    const subject = `itest-retry-${Date.now()}`;
    const windowSeconds = 600;
    try {
      await spendRateLimit(db, 'payments-refund', subject, { max: 1, windowSeconds });
      const refused = (await spendRateLimit(db, 'payments-refund', subject, { max: 1, windowSeconds }))!;
      const retryAfter = Number(refused.headers.get('retry-after'));
      // Windows are aligned to multiples of the window length since 2000-01-01T00:00Z.
      const origin = Date.UTC(2000, 0, 1);
      const left = Math.ceil((windowSeconds * 1000 - ((Date.now() - origin) % (windowSeconds * 1000))) / 1000);
      expect(Math.abs(retryAfter - left)).toBeLessThanOrEqual(2);
    } finally {
      await serviceClient().from('rate_limit_counters').delete().like('bucket', `%:${subject}`);
    }
  });

  it('fails closed: if the budget cannot be checked, the request is refused with 503', async () => {
    const broken: Db = {
      ...db,
      rpcAsService: async () => ({ data: null, error: { message: 'relation does not exist' } }),
    };
    const response = await spendRateLimit(broken, 'payments-refund', 'anyone');
    expect(response?.status).toBe(503);

    // And through the handler: no Razorpay call is made.
    const someone = await createTestUser('rzp-budget-broken');
    fresh.push(someone);
    const bookingId = await acceptedBooking(vendor, someone);
    const res = await call(
      (req) => handleCreateOrder(req, { db: broken, razorpay, keyId: KEY_ID }),
      { booking_id: bookingId },
      await bearerFor(someone),
    );
    expect(res.status).toBe(503);
    expect(razorpay.calls.createOrder + razorpay.calls.findOrderByReceipt).toBe(0);
  });

  it('concurrent requests are serialised: the second waits on the first\'s row lock, then counts', async () => {
    const bucket = `itest-lock:${Date.now()}`;
    const [t1, t2, observer] = [new pg.Client(DB_URL), new pg.Client(DB_URL), new pg.Client(DB_URL)];
    await Promise.all([t1.connect(), t2.connect(), observer.connect()]);
    const spend = (c: pg.Client) =>
      c.query('select allowed from public.consume_rate_limit($1, 1, 600)', [bucket]).then((r) => r.rows[0].allowed as boolean);
    try {
      const { rows } = await t2.query('select pg_backend_pid() as pid');
      await t1.query('begin');
      expect(await spend(t1)).toBe(true); // holds the counter row until commit

      await t2.query('begin');
      const second = spend(t2);
      // Blocked on the lock — not racing ahead with its own count of 1.
      await expect
        .poll(async () => (await observer.query('select wait_event_type from pg_stat_activity where pid = $1', [rows[0].pid])).rows[0]?.wait_event_type)
        .toBe('Lock');

      await t1.query('commit');
      expect(await second).toBe(false); // sees the first hit: over the budget of 1
      await t2.query('commit');
    } finally {
      await observer.query('delete from public.rate_limit_counters where bucket = $1', [bucket]);
      await Promise.all([t1.end(), t2.end(), observer.end()]);
    }
  });

  it('many simultaneous connections cannot exceed the budget', async () => {
    const bucket = `itest-burst:${Date.now()}`;
    const clients = Array.from({ length: 20 }, () => new pg.Client(DB_URL));
    await Promise.all(clients.map((c) => c.connect()));
    try {
      const verdicts = await Promise.all(
        clients.map((c) => c.query('select allowed from public.consume_rate_limit($1, 5, 600)', [bucket])),
      );
      expect(verdicts.filter((v) => v.rows[0].allowed).length).toBe(5);
    } finally {
      await clients[0].query('delete from public.rate_limit_counters where bucket = $1', [bucket]);
      await Promise.all(clients.map((c) => c.end()));
    }
  });
});
