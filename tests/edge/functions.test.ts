/**
 * The edge functions, live: the real Deno entry points behind Supabase's
 * gateway, called over HTTP the way a browser, Razorpay and the scheduler call
 * them.
 *
 * Everything else in tests/ runs the shared handlers in Node. This suite proves
 * what only the deployed shape can: the per-function JWT settings in
 * supabase/config.toml, the environment wiring in each index.ts, CORS, and the
 * service-role check in payments-reconcile.
 *
 * Run with `npm run test:edge` while `supabase functions serve` is running with
 * the environment in docs/CI_CD.md (CI does this). It does not skip: if the
 * functions are not being served, it fails.
 *
 * No network call leaves the machine. RAZORPAY_API_BASE points at a closed
 * local port, so the order path exercises the real "Razorpay unreachable"
 * handling.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  createTestUser,
  deleteTestUser,
  serviceClient,
  type TestUser,
} from '../helpers/supabase';
import { hmacSha256Hex } from '../../supabase/functions/_shared/razorpay.ts';

const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;
/** Must equal RAZORPAY_WEBHOOK_SECRET in the env file `functions serve` was given. */
const WEBHOOK_SECRET = process.env.OCASIO_EDGE_WEBHOOK_SECRET ?? 'edge-test-webhook-secret';

let customer: TestUser;
let stranger: TestUser;
let vendor: TestUser;
let vendorId: string;
let bookingId: string;

const bearer = async (user: TestUser) =>
  `Bearer ${(await user.client.auth.getSession()).data.session!.access_token}`;

async function call(name: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const response = await fetch(`${FUNCTIONS}/${name}`, {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body,
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json, headers: response.headers };
}

beforeAll(async () => {
  // Fail, never skip: this suite exists to prove the functions run.
  const probe = await fetch(`${FUNCTIONS}/payments-webhook`, { method: 'GET' }).catch(() => null);
  if (!probe || probe.status !== 405) {
    throw new Error(
      `Edge functions are not being served at ${FUNCTIONS} (got ${probe?.status ?? 'no response'}). ` +
        'Start them with `npx supabase functions serve --env-file <file>` — see docs/CI_CD.md.',
    );
  }

  [customer, stranger, vendor] = await Promise.all([
    createTestUser('edge-cust'),
    createTestUser('edge-stranger'),
    createTestUser('edge-vendor'),
  ]);
  const admin = serviceClient();
  const { data: v, error } = await vendor.client.rpc('request_vendor_onboarding', {
    p_business_name: `Edge Vendor ${Date.now()}`,
    p_category: 'Catering',
    p_location: 'Jaipur',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);
  vendorId = v.id;
  await admin.from('vendors').update({ status: 'active', starting_price: 30_000 }).eq('id', vendorId);
  await admin.from('profiles').update({ role: 'vendor' }).eq('id', vendor.id);
  const { data: service } = await admin
    .from('vendor_services')
    .insert({ vendor_id: vendorId, name: 'Edge feast', price: 30_000 })
    .select()
    .single();

  const { data: booking } = await customer.client.rpc('create_booking', {
    p_vendor_service_id: service!.id,
    p_event_date: new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10),
    p_event_location: 'C-Scheme, Jaipur',
  });
  bookingId = booking.id;
  await vendor.client.rpc('transition_booking_status', { p_booking_id: bookingId, p_new_status: 'accepted' });
});

afterAll(async () => {
  const admin = serviceClient();
  if (vendorId) {
    const { data: payments } = await admin.from('payments').select('id').eq('vendor_id', vendorId);
    const ids = (payments ?? []).map((p) => p.id);
    if (ids.length) {
      await admin.from('payment_events').delete().in('payment_id', ids);
      await admin.from('payments').delete().in('id', ids);
    }
    await admin.from('bookings').delete().eq('vendor_id', vendorId);
    await admin.from('vendor_services').delete().eq('vendor_id', vendorId);
    await admin.from('vendors').delete().eq('id', vendorId);
  }
  await admin.from('payment_events').delete().like('provider_event_id', 'edge_%');
  await Promise.all([customer, stranger, vendor].filter(Boolean).map(deleteTestUser));
});

describe('payments-webhook (JWT verification off; the Razorpay signature is the authentication)', () => {
  const body = JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_EdgeUnknown01', order_id: 'order_EdgeUnknown01', amount: 100, currency: 'INR', status: 'captured' } } },
  });

  it('reaches the function without any Supabase JWT, and refuses a missing signature', async () => {
    const { status, json } = await call('payments-webhook', { body });
    expect(status).toBe(401);
    expect(json).toEqual({ error: 'invalid signature' }); // the function's answer, not the gateway's
  });

  it('refuses a signature made with the wrong secret', async () => {
    const { status } = await call('payments-webhook', {
      body,
      headers: { 'x-razorpay-signature': await hmacSha256Hex('wrong-secret', body) },
    });
    expect(status).toBe(401);
  });

  it('accepts a correctly signed event and acknowledges an order Ocasio does not know', async () => {
    const { status, json } = await call('payments-webhook', {
      body,
      headers: {
        'x-razorpay-signature': await hmacSha256Hex(WEBHOOK_SECRET, body),
        'x-razorpay-event-id': `edge_${Date.now()}`,
      },
    });
    expect(status).toBe(200);
    expect(json).toEqual({ ignored: 'no matching payment' });
  });

  it('acknowledges event types it does not use', async () => {
    const other = JSON.stringify({ entity: 'event', event: 'order.paid', payload: {} });
    const { status, json } = await call('payments-webhook', {
      body: other,
      headers: { 'x-razorpay-signature': await hmacSha256Hex(WEBHOOK_SECRET, other) },
    });
    expect(status).toBe(200);
    expect(json).toEqual({ ignored: 'order.paid' });
  });
});

describe('payments-create-order (JWT verification on)', () => {
  it('lets a browser preflight a signed-in POST', async () => {
    // Locally the gateway (Kong) answers preflights itself with 200; hosted, the
    // function's own handler answers with 204. Either way the browser needs a
    // 2xx that allows POST with these headers — that is what is asserted.
    const response = await fetch(`${FUNCTIONS}/payments-create-order`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://ocasio.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, apikey, x-client-info',
      },
    });
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toMatch(/POST/);
    for (const header of ['authorization', 'content-type', 'apikey', 'x-client-info']) {
      expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(header);
    }
  });

  it('is refused at the gateway without a JWT', async () => {
    const { status, json } = await call('payments-create-order', { body: JSON.stringify({ booking_id: bookingId }) });
    expect(status).toBe(401);
    expect(json.error).not.toBe('Sign in to pay for this booking.'); // never reached the function
  });

  it('refuses the anon key: a valid JWT, but nobody signed in', async () => {
    const { status } = await call('payments-create-order', {
      body: JSON.stringify({ booking_id: bookingId }),
      headers: { authorization: `Bearer ${ANON_KEY}` },
    });
    expect(status).toBe(401);
  });

  it('refuses another customer\'s booking', async () => {
    const { status } = await call('payments-create-order', {
      body: JSON.stringify({ booking_id: bookingId }),
      headers: { authorization: await bearer(stranger) },
    });
    expect(status).toBe(404);
  });

  it('for the customer, reaches Razorpay — and reports an outage without opening a half-made order', async () => {
    const { status, json } = await call('payments-create-order', {
      body: JSON.stringify({ booking_id: bookingId, amount_minor: 1 }),
      headers: { authorization: await bearer(customer) },
    });
    expect(status).toBe(502);
    expect(String(json.error)).toMatch(/Razorpay could not start this payment/);

    const { data } = await serviceClient().from('payments').select('status, provider_order_id, amount_minor').eq('booking_id', bookingId);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ status: 'pending', provider_order_id: null, amount_minor: 3_000_000 });
  });
});

describe('payments-refund (JWT verification on)', () => {
  it('refuses the anon key', async () => {
    const { status } = await call('payments-refund', {
      body: JSON.stringify({ payment_id: '00000000-0000-4000-8000-000000000000', amount_minor: 100, idempotency_key: 'refund:edge:1' }),
      headers: { authorization: `Bearer ${ANON_KEY}` },
    });
    expect(status).toBe(401);
  });

  it('refuses a customer\'s refund attempt on their own payment', async () => {
    const { data } = await serviceClient().from('payments').select('id').eq('booking_id', bookingId).single();
    const { status } = await call('payments-refund', {
      body: JSON.stringify({ payment_id: data!.id, amount_minor: 100, idempotency_key: `refund:edge:${Date.now()}` }),
      headers: { authorization: await bearer(customer) },
    });
    // Not settled and not theirs to refund: the database refuses before Razorpay.
    expect([404, 409]).toContain(status);
  });
});

describe('payments-reconcile (scheduler only)', () => {
  it('refuses the anon key — the hole the audit closed', async () => {
    const { status, json } = await call('payments-reconcile', { headers: { authorization: `Bearer ${ANON_KEY}` }, body: '{}' });
    expect(status).toBe(403);
    expect(json).toEqual({ error: 'forbidden' });
  });

  it('refuses a signed-in user', async () => {
    const { status } = await call('payments-reconcile', { headers: { authorization: await bearer(customer) }, body: '{}' });
    expect(status).toBe(403);
  });

  it('runs for the service-role key', async () => {
    const { status, json } = await call('payments-reconcile', {
      headers: { authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: '{}',
    });
    expect(status).toBe(200);
    expect(json).toHaveProperty('examined');
  });
});
