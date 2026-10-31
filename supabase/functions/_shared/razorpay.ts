/**
 * Razorpay, as Ocasio uses it: Orders, Refunds and webhook verification.
 *
 * Runs on Deno (the edge functions) and on Node (the test suite), so it uses
 * only web-standard APIs — fetch, Web Crypto, TextEncoder, btoa — and takes
 * `fetch` as a parameter so tests can stand in for Razorpay's servers.
 *
 * Nothing here touches the database, and nothing here decides whether money
 * moved. It talks to Razorpay and reports exactly what Razorpay said.
 */

export const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

/**
 * What a failed call means for the caller:
 *   rejected   Razorpay refused the request; sending it again will not help
 *   duplicate  the receipt was used before, so the object already exists
 *   retryable  timeout, network, 5xx, rate limit, "operation in progress"
 *   auth       the key id or secret was refused — a configuration problem
 */
export type RazorpayErrorKind = 'rejected' | 'duplicate' | 'retryable' | 'auth';

export class RazorpayError extends Error {
  constructor(
    readonly kind: RazorpayErrorKind,
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'RazorpayError';
  }
}

export interface RazorpayApi {
  createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrder>;
  findOrderByReceipt(receipt: string): Promise<RazorpayOrder | null>;
  createRefund(
    paymentId: string,
    input: { amount: number; receipt: string; notes: Record<string, string> },
  ): Promise<RazorpayRefund>;
  findRefundByReceipt(paymentId: string, receipt: string): Promise<RazorpayRefund | null>;
}

export interface RazorpayApiConfig {
  keyId: string;
  keySecret: string;
  /** Development only: point at a local stand-in. Production uses the default. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
const REFUND_ID = /^rfnd_[A-Za-z0-9]{6,40}$/;
const CURRENCY = /^[A-Z]{3}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Turns an error response into a decision. Only Razorpay's own words count. */
function classify(status: number, body: unknown): RazorpayError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const description =
    typeof error.description === 'string' && error.description ? error.description : `HTTP ${status}`;
  const code = typeof error.code === 'string' ? error.code : undefined;

  if (status === 401 || status === 403) return new RazorpayError('auth', status, description, code);
  if (status === 429 || status >= 500) return new RazorpayError('retryable', status, description, code);
  if (/another payment operation is in progress/i.test(description)) {
    return new RazorpayError('retryable', status, description, code);
  }
  if (/receipt/i.test(description) && /duplicate|already|exists|unique/i.test(description)) {
    return new RazorpayError('duplicate', status, description, code);
  }
  if (/already been processed/i.test(description)) {
    return new RazorpayError('duplicate', status, description, code);
  }
  return new RazorpayError('rejected', status, description, code);
}

/**
 * A response Ocasio cannot read is treated as retryable, not as a failure:
 * the object may well exist, and the receipt will find it next time.
 */
function readOrder(value: unknown): RazorpayOrder {
  if (!isRecord(value) || typeof value.id !== 'string' || !ORDER_ID.test(value.id)
      || !isAmount(value.amount) || typeof value.currency !== 'string') {
    throw new RazorpayError('retryable', 200, 'Razorpay returned an order Ocasio could not read.');
  }
  return {
    id: value.id,
    amount: value.amount,
    currency: value.currency.toUpperCase(),
    receipt: typeof value.receipt === 'string' ? value.receipt : null,
    status: typeof value.status === 'string' ? value.status : '',
  };
}

function readRefund(value: unknown): RazorpayRefund {
  if (!isRecord(value) || typeof value.id !== 'string' || !REFUND_ID.test(value.id)
      || typeof value.payment_id !== 'string' || !isAmount(value.amount)
      || typeof value.currency !== 'string') {
    throw new RazorpayError('retryable', 200, 'Razorpay returned a refund Ocasio could not read.');
  }
  return {
    id: value.id,
    payment_id: value.payment_id,
    amount: value.amount,
    currency: value.currency.toUpperCase(),
    receipt: typeof value.receipt === 'string' ? value.receipt : null,
    status: typeof value.status === 'string' ? value.status : '',
  };
}

const itemsOf = (value: unknown): unknown[] =>
  isRecord(value) && Array.isArray(value.items) ? value.items : [];

export function createRazorpayApi(config: RazorpayApiConfig): RazorpayApi {
  const baseUrl = (config.baseUrl || RAZORPAY_API_BASE).replace(/\/+$/, '');
  const send = config.fetch ?? fetch;
  const authorization = `Basic ${btoa(`${config.keyId}:${config.keySecret}`)}`;
  const timeoutMs = config.timeoutMs ?? 10_000;

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await send(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Includes timeouts. A request that timed out may still have been
      // applied, which is why every create carries a receipt.
      throw new RazorpayError('retryable', 0, `Razorpay could not be reached: ${e instanceof Error ? e.message : String(e)}`);
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) throw classify(response.status, parsed);
    return parsed;
  }

  return {
    async createOrder({ amount, currency, receipt, notes }) {
      return readOrder(await call('POST', '/orders', { amount, currency, receipt, notes }));
    },

    async findOrderByReceipt(receipt) {
      const found = await call('GET', `/orders?receipt=${encodeURIComponent(receipt)}&count=10`);
      const match = itemsOf(found).find((item) => isRecord(item) && item.receipt === receipt);
      return match ? readOrder(match) : null;
    },

    async createRefund(paymentId, { amount, receipt, notes }) {
      if (!PAYMENT_ID.test(paymentId)) {
        throw new RazorpayError('rejected', 0, 'Not a Razorpay payment id.');
      }
      // `receipt` is Razorpay's idempotency key for refunds: a second request
      // with the same receipt is refused rather than refunded twice.
      return readRefund(
        await call('POST', `/payments/${paymentId}/refund`, { amount, speed: 'normal', receipt, notes }),
      );
    },

    async findRefundByReceipt(paymentId, receipt) {
      if (!PAYMENT_ID.test(paymentId)) return null;
      const found = await call('GET', `/payments/${paymentId}/refunds?count=100`);
      const match = itemsOf(found).find((item) => isRecord(item) && item.receipt === receipt);
      return match ? readRefund(match) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Webhook signatures
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** HMAC-SHA256 as lowercase hex — how Razorpay signs a webhook body. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  return toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(message)));
}

export async function sha256Hex(message: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(message)));
}

/**
 * Verifies `X-Razorpay-Signature` against the RAW request body.
 *
 * The body must be the exact bytes received: re-serialising parsed JSON changes
 * them and the signature no longer matches. Web Crypto's verify() compares in
 * constant time, so a forger cannot learn the signature byte by byte. No
 * secret, no signature, or a signature of the wrong shape all fail closed.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string | null | undefined,
): Promise<boolean> {
  if (!secret || !signature) return false;
  const hex = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), hexToBytes(hex), encoder.encode(rawBody));
}

/**
 * The event's id for de-duplication. Razorpay sends it as `x-razorpay-event-id`
 * and delivers at least once, so the same id can arrive several times. Without
 * the header, the body's hash stands in: a redelivery repeats the same body.
 */
export async function webhookEventId(header: string | null, rawBody: string): Promise<string> {
  const id = header?.trim() ?? '';
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : `body-sha256:${await sha256Hex(rawBody)}`;
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | {
      kind: 'payment';
      type: 'payment.captured' | 'payment.failed';
      paymentId: string;
      orderId: string;
      amount: number;
      currency: string;
      status: string;
      method: string | null;
      errorCode: string | null;
      errorReason: string | null;
      errorDescription: string | null;
    }
  | {
      kind: 'refund';
      type: 'refund.processed' | 'refund.failed';
      refundId: string;
      paymentId: string;
      orderId: string | null;
      amount: number;
      currency: string;
      status: string;
      /** Ocasio's refund id, from the receipt (or notes) it set on the request. */
      reference: string | null;
    }
  | { kind: 'ignored'; type: string };

const PAYMENT_EVENTS = new Set(['payment.captured', 'payment.failed']);
const REFUND_EVENTS = new Set(['refund.processed', 'refund.failed']);

const text = (value: unknown, max = 200): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const entityOf = (payload: unknown, name: string): Record<string, unknown> | null => {
  if (!isRecord(payload) || !isRecord(payload[name])) return null;
  const entity = (payload[name] as Record<string, unknown>).entity;
  return isRecord(entity) ? entity : null;
};

/**
 * Reads a verified webhook body. Returns null when a supported event does not
 * have the shape Razorpay documents — that is a parsing bug or a changed API,
 * and guessing at money would be worse than refusing. Events Ocasio does not
 * act on come back as `ignored`.
 */
export function parseWebhookEvent(body: unknown): WebhookEvent | null {
  if (!isRecord(body) || typeof body.event !== 'string') return null;
  const type = body.event;

  if (PAYMENT_EVENTS.has(type)) {
    const payment = entityOf(body.payload, 'payment');
    if (!payment) return null;
    const { id, order_id, amount, currency } = payment;
    if (typeof id !== 'string' || !PAYMENT_ID.test(id)) return null;
    if (typeof order_id !== 'string' || !ORDER_ID.test(order_id)) return null;
    if (!isAmount(amount) || typeof currency !== 'string' || !CURRENCY.test(currency.toUpperCase())) return null;
    return {
      kind: 'payment',
      type: type as 'payment.captured' | 'payment.failed',
      paymentId: id,
      orderId: order_id,
      amount,
      currency: currency.toUpperCase(),
      status: text(payment.status) ?? '',
      method: text(payment.method, 40),
      errorCode: text(payment.error_code, 80),
      errorReason: text(payment.error_reason, 80),
      errorDescription: text(payment.error_description),
    };
  }

  if (REFUND_EVENTS.has(type)) {
    const refund = entityOf(body.payload, 'refund');
    if (!refund) return null;
    const { id, payment_id, amount, currency } = refund;
    if (typeof id !== 'string' || !REFUND_ID.test(id)) return null;
    if (typeof payment_id !== 'string' || !PAYMENT_ID.test(payment_id)) return null;
    if (!isAmount(amount) || typeof currency !== 'string' || !CURRENCY.test(currency.toUpperCase())) return null;

    // notes arrives as an object, or as [] when empty.
    const notes = isRecord(refund.notes) ? refund.notes : {};
    const payment = entityOf(body.payload, 'payment');
    const orderId = payment && typeof payment.order_id === 'string' && ORDER_ID.test(payment.order_id)
      ? payment.order_id
      : null;

    return {
      kind: 'refund',
      type: type as 'refund.processed' | 'refund.failed',
      refundId: id,
      paymentId: payment_id,
      orderId,
      amount,
      currency: currency.toUpperCase(),
      status: text(refund.status) ?? '',
      reference: text(refund.receipt, 64) ?? text(notes.ocasio_refund_id, 64),
    };
  }

  return { kind: 'ignored', type };
}

/**
 * What Ocasio keeps of an event: identifiers, amounts and outcome. Razorpay's
 * payment entity also carries the customer's email, phone, UPI address and
 * card details; none of that is needed to settle money, so none of it is
 * stored.
 */
export function eventRecord(event: Exclude<WebhookEvent, { kind: 'ignored' }>): Record<string, unknown> {
  if (event.kind === 'payment') {
    return {
      event: event.type,
      payment_id: event.paymentId,
      order_id: event.orderId,
      amount: event.amount,
      currency: event.currency,
      status: event.status,
      method: event.method,
      error_code: event.errorCode,
      error_reason: event.errorReason,
      error_description: event.errorDescription,
    };
  }
  return {
    event: event.type,
    refund_id: event.refundId,
    payment_id: event.paymentId,
    order_id: event.orderId,
    amount: event.amount,
    currency: event.currency,
    status: event.status,
    reference: event.reference,
  };
}
