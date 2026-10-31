/**
 * The Razorpay boundary: the HTTP client and the webhook parser in
 * supabase/functions/_shared/razorpay.ts.
 *
 * No network. `fetch` is replaced with a recorder that answers the way
 * Razorpay's documentation says it answers, so these tests pin down what
 * Ocasio sends — URL, method, Basic auth, body — and how each documented error
 * is classified. The classification decides whether a refund is marked failed
 * or sent again, so it is money logic, not plumbing.
 */
import { describe, expect, it } from 'vitest';
import {
  RazorpayError,
  createRazorpayApi,
  eventRecord,
  parseWebhookEvent,
} from '../supabase/functions/_shared/razorpay.ts';

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch that records each request and answers with the next scripted reply. */
function scriptedFetch(...replies: Array<{ status: number; body: unknown } | Error>) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      headers[name] = value;
    });
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
  return { fetchImpl, sent };
}

const KEY_ID = 'rzp_test_ABCDEF123456';
const KEY_SECRET = 'not-a-real-secret-0123456789';

const order = {
  id: 'order_RB58MiP5SPFYyM',
  entity: 'order',
  amount: 4_000_000,
  amount_paid: 0,
  amount_due: 4_000_000,
  currency: 'INR',
  receipt: '6c3d1f2a-0000-4000-8000-000000000001',
  status: 'created',
  attempts: 0,
  notes: {},
  created_at: 1756455561,
};

const refund = {
  id: 'rfnd_FP8QHiV938haTz',
  entity: 'refund',
  amount: 500_000,
  receipt: '6c3d1f2a-0000-4000-8000-0000000000aa',
  currency: 'INR',
  payment_id: 'pay_29QQoUBi66xm2f',
  notes: { ocasio_refund_id: '6c3d1f2a-0000-4000-8000-0000000000aa' },
  status: 'pending',
};

describe('Razorpay API client', () => {
  it('creates an order with Basic auth and exactly the documented fields', async () => {
    const { fetchImpl, sent } = scriptedFetch({ status: 200, body: order });
    const api = createRazorpayApi({ keyId: KEY_ID, keySecret: KEY_SECRET, fetch: fetchImpl });

    const created = await api.createOrder({
      amount: 4_000_000,
      currency: 'INR',
      receipt: order.receipt,
      notes: { ocasio_payment_id: order.receipt },
    });

    expect(created).toMatchObject({ id: order.id, amount: 4_000_000, currency: 'INR' });
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('POST');
    expect(sent[0].url).toBe('https://api.razorpay.com/v1/orders');
    expect(sent[0].headers.authorization).toBe(`Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`);
    expect(sent[0].body).toEqual({
      amount: 4_000_000,
      currency: 'INR',
      receipt: order.receipt,
      notes: { ocasio_payment_id: order.receipt },
    });
  });

  it('never puts the key secret in a URL or a body', async () => {
    const { fetchImpl, sent } = scriptedFetch(
      { status: 200, body: order },
      { status: 200, body: { entity: 'collection', count: 0, items: [] } },
    );
    const api = createRazorpayApi({ keyId: KEY_ID, keySecret: KEY_SECRET, fetch: fetchImpl });
    await api.createOrder({ amount: 100, currency: 'INR', receipt: 'r', notes: {} });
    await api.findOrderByReceipt('r');

    for (const request of sent) {
      expect(request.url).not.toContain(KEY_SECRET);
      expect(JSON.stringify(request.body ?? {})).not.toContain(KEY_SECRET);
    }
  });

  it('finds an order by its exact receipt only', async () => {
    const { fetchImpl, sent } = scriptedFetch({
      status: 200,
      body: { entity: 'collection', count: 2, items: [{ ...order, id: 'order_OTHERxyz123', receipt: 'other' }, order] },
    });
    const api = createRazorpayApi({ keyId: KEY_ID, keySecret: KEY_SECRET, fetch: fetchImpl });

    const found = await api.findOrderByReceipt(order.receipt);
    expect(found?.id).toBe(order.id);
    expect(sent[0].method).toBe('GET');
    expect(sent[0].url).toContain(`receipt=${encodeURIComponent(order.receipt)}`);
  });

  it('creates a refund at normal speed, with the receipt as its idempotency key', async () => {
    const { fetchImpl, sent } = scriptedFetch({ status: 200, body: refund });
    const api = createRazorpayApi({ keyId: KEY_ID, keySecret: KEY_SECRET, fetch: fetchImpl });

    const created = await api.createRefund(refund.payment_id, {
      amount: 500_000,
      receipt: refund.receipt,
      notes: { ocasio_refund_id: refund.receipt },
    });

    expect(created).toMatchObject({ id: refund.id, payment_id: refund.payment_id, amount: 500_000 });
    expect(sent[0].url).toBe(`https://api.razorpay.com/v1/payments/${refund.payment_id}/refund`);
    expect(sent[0].body).toEqual({
      amount: 500_000,
      speed: 'normal',
      receipt: refund.receipt,
      notes: { ocasio_refund_id: refund.receipt },
    });
  });

  it('refuses to build a refund URL from something that is not a payment id', async () => {
    const { fetchImpl, sent } = scriptedFetch();
    const api = createRazorpayApi({ keyId: KEY_ID, keySecret: KEY_SECRET, fetch: fetchImpl });
    await expect(
      api.createRefund('../orders', { amount: 100, receipt: 'r', notes: {} }),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(sent).toHaveLength(0);
  });

  it('finds a refund by receipt among the payment\'s refunds', async () => {
    const { fetchImpl, sent } = scriptedFetch({
      status: 200,
      body: { entity: 'collection', count: 1, items: [refund] },
    });
    const api = createRazorpayApi({ keyId: KEY_ID, keySecret: KEY_SECRET, fetch: fetchImpl });

    expect((await api.findRefundByReceipt(refund.payment_id, refund.receipt))?.id).toBe(refund.id);
    expect(sent[0].url).toBe(`https://api.razorpay.com/v1/payments/${refund.payment_id}/refunds?count=100`);
  });

  describe('error classification', () => {
    const cases: Array<[string, { status: number; body: unknown } | Error, string]> = [
      ['an amount above what was captured is final',
        { status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'The refund amount provided is greater than amount captured.' } } },
        'rejected'],
      ['an unsupported method is final',
        { status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'Refund is currently not supported for this payment method.' } } },
        'rejected'],
      ['a reused refund receipt means the refund exists',
        { status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'Duplicate receipt found for this refund request.' } } },
        'duplicate'],
      ['"already processed" means the refund exists',
        { status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'Refund has already been processed.' } } },
        'duplicate'],
      ['a concurrent operation is worth retrying',
        { status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'Request failed because another payment operation is in progress.' } } },
        'retryable'],
      ['bad credentials are a configuration problem',
        { status: 401, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'The API key provided is invalid.' } } },
        'auth'],
      ['rate limiting is retryable', { status: 429, body: {} }, 'retryable'],
      ['a server error is retryable', { status: 502, body: {} }, 'retryable'],
      ['a network failure or timeout is retryable', new TypeError('fetch failed'), 'retryable'],
      ['an unreadable success is retryable, not trusted', { status: 200, body: { id: 'not-an-order' } }, 'retryable'],
    ];

    for (const [name, reply, kind] of cases) {
      it(name, async () => {
        const { fetchImpl } = scriptedFetch(reply);
        const api = createRazorpayApi({ keyId: KEY_ID, keySecret: KEY_SECRET, fetch: fetchImpl });
        const attempt = api.createOrder({ amount: 100, currency: 'INR', receipt: 'r', notes: {} });
        await expect(attempt).rejects.toBeInstanceOf(RazorpayError);
        await expect(attempt).rejects.toMatchObject({ kind });
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Webhook parsing — fixtures follow Razorpay's documented payload shapes.
// ---------------------------------------------------------------------------

const captured = {
  entity: 'event',
  account_id: 'acc_E7OQJcEANmBHTC',
  event: 'payment.captured',
  contains: ['payment'],
  payload: {
    payment: {
      entity: {
        id: 'pay_FPoJKWQQ8lK13n',
        entity: 'payment',
        amount: 500000,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_FPoIUh7ijNObLs',
        method: 'upi',
        captured: true,
        email: 'customer@example.com',
        contact: '+919000090000',
        vpa: 'customer@okbank',
        card: { last4: '1111', network: 'Visa' },
        error_code: null,
        error_description: null,
      },
    },
  },
  created_at: 1597734071,
};

const failed = {
  ...captured,
  event: 'payment.failed',
  payload: {
    payment: {
      entity: {
        ...captured.payload.payment.entity,
        status: 'failed',
        captured: false,
        error_code: 'BAD_REQUEST_ERROR',
        error_reason: 'payment_failed',
        error_description: 'Payment failed due to incorrect OTP.',
      },
    },
  },
};

const processed = {
  entity: 'event',
  account_id: 'acc_E7OQJcEANmBHTC',
  event: 'refund.processed',
  contains: ['refund', 'payment'],
  payload: {
    refund: {
      entity: {
        id: 'rfnd_FS8TWyPrCsa0OB',
        entity: 'refund',
        amount: 50000,
        currency: 'INR',
        payment_id: 'pay_FPoJKWQQ8lK13n',
        notes: { ocasio_refund_id: '7d9a3a2e-1111-4111-8111-111111111111' },
        receipt: '7d9a3a2e-1111-4111-8111-111111111111',
        status: 'processed',
      },
    },
    payment: { entity: { id: 'pay_FPoJKWQQ8lK13n', order_id: 'order_FPoIUh7ijNObLs', captured: true } },
  },
  created_at: 1597734071,
};

describe('webhook parsing', () => {
  it('reads a payment.captured event', () => {
    expect(parseWebhookEvent(captured)).toMatchObject({
      kind: 'payment',
      type: 'payment.captured',
      paymentId: 'pay_FPoJKWQQ8lK13n',
      orderId: 'order_FPoIUh7ijNObLs',
      amount: 500000,
      currency: 'INR',
    });
  });

  it('reads a payment.failed event with its reason', () => {
    expect(parseWebhookEvent(failed)).toMatchObject({
      kind: 'payment',
      type: 'payment.failed',
      errorCode: 'BAD_REQUEST_ERROR',
      errorReason: 'payment_failed',
      errorDescription: 'Payment failed due to incorrect OTP.',
    });
  });

  it('reads a refund event, with Ocasio\'s refund id from the receipt', () => {
    expect(parseWebhookEvent(processed)).toMatchObject({
      kind: 'refund',
      type: 'refund.processed',
      refundId: 'rfnd_FS8TWyPrCsa0OB',
      paymentId: 'pay_FPoJKWQQ8lK13n',
      orderId: 'order_FPoIUh7ijNObLs',
      amount: 50000,
      reference: '7d9a3a2e-1111-4111-8111-111111111111',
    });
  });

  it('copes with empty notes arriving as [] and a null receipt', () => {
    const bare = structuredClone(processed);
    bare.payload.refund.entity.receipt = null as unknown as string;
    (bare.payload.refund.entity as Record<string, unknown>).notes = [];
    expect(parseWebhookEvent(bare)).toMatchObject({ kind: 'refund', reference: null });
  });

  it('acknowledges event types Ocasio does not act on, without reading them', () => {
    expect(parseWebhookEvent({ event: 'order.paid', payload: {} })).toEqual({ kind: 'ignored', type: 'order.paid' });
    expect(parseWebhookEvent({ event: 'payment.authorized', payload: {} })).toEqual({
      kind: 'ignored',
      type: 'payment.authorized',
    });
  });

  it('refuses a supported event that does not have the documented shape', () => {
    const noOrder = structuredClone(captured);
    delete (noOrder.payload.payment.entity as Record<string, unknown>).order_id;
    const fractional = structuredClone(captured);
    fractional.payload.payment.entity.amount = 500.5;
    const badId = structuredClone(captured);
    badId.payload.payment.entity.id = 'order_notapayment';

    expect(parseWebhookEvent(noOrder)).toBeNull();
    expect(parseWebhookEvent(fractional)).toBeNull();
    expect(parseWebhookEvent(badId)).toBeNull();
    expect(parseWebhookEvent('payment.captured')).toBeNull();
    expect(parseWebhookEvent({ event: 'refund.processed', payload: {} })).toBeNull();
  });

  it('keeps no customer contact or card details in what is stored', () => {
    const event = parseWebhookEvent(captured);
    if (!event || event.kind === 'ignored') throw new Error('expected a payment event');
    const stored = JSON.stringify(eventRecord(event));

    expect(stored).not.toContain('customer@example.com');
    expect(stored).not.toContain('+919000090000');
    expect(stored).not.toContain('customer@okbank');
    expect(stored).not.toContain('1111');
    expect(stored).toContain('pay_FPoJKWQQ8lK13n');
  });
});
