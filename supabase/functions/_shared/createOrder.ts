/**
 * payments-create-order: opens a Razorpay payment for a booking.
 *
 *   1. Authenticate the customer from their bearer token.
 *   2. begin_razorpay_payment(), as the customer: the database checks they own
 *      the booking, that it is accepted, and derives the amount. The browser
 *      sends a booking id and nothing else — never an amount.
 *   3. Check the amount and currency before anything leaves for Razorpay.
 *   4. Create the Razorpay order, once per payment. The payment id is the
 *      order's receipt, so an order created by a request that crashed before
 *      recording it is found and reused, not duplicated.
 *   5. prepare_razorpay_checkout(), with the service role: record the order
 *      and open the attempt. The only way an order id reaches a payment.
 *   6. Return what Checkout needs — order id, amount, currency, public key id.
 *      Never the key secret.
 *
 * Calling it again for the same booking returns the same order, so a double
 * click, a retry or a second tab cannot open a second order.
 */
import type { Db } from './db.ts';
import { RazorpayError, type RazorpayApi, type RazorpayOrder } from './razorpay.ts';
import { UUID, bearer, dbErrorResponse, json, preflight, readJson } from './http.ts';

export interface CreateOrderDeps {
  db: Db;
  /** Null when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. */
  razorpay: RazorpayApi | null;
  keyId: string | null;
}

interface PaymentRow {
  id: string;
  booking_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  provider_order_id: string | null;
}

/** Razorpay's minimum charge is ₹1.00. */
const MIN_AMOUNT_MINOR = 100;

async function orderFor(razorpay: RazorpayApi, payment: PaymentRow): Promise<RazorpayOrder> {
  const existing = await razorpay.findOrderByReceipt(payment.id);
  if (existing) return existing;

  try {
    return await razorpay.createOrder({
      amount: payment.amount_minor,
      currency: payment.currency,
      receipt: payment.id,
      notes: { ocasio_payment_id: payment.id, ocasio_booking_id: payment.booking_id },
    });
  } catch (e) {
    // A concurrent request created it between the lookup and here.
    if (e instanceof RazorpayError && e.kind === 'duplicate') {
      const raced = await razorpay.findOrderByReceipt(payment.id);
      if (raced) return raced;
    }
    throw e;
  }
}

export async function handleCreateOrder(req: Request, deps: CreateOrderDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  if (!deps.razorpay || !deps.keyId) {
    console.error('[payments-create-order] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
    return json(503, { error: 'Online payments are not available right now.' });
  }

  const authorization = bearer(req);
  if (!authorization) return json(401, { error: 'Sign in to pay for this booking.' });

  const user = await deps.db.userFor(authorization);
  if (!user) return json(401, { error: 'Your session has expired. Sign in again to pay.' });

  const body = await readJson(req);
  const bookingId = body?.booking_id;
  if (typeof bookingId !== 'string' || !UUID.test(bookingId)) {
    return json(400, { error: 'A booking id is required.' });
  }

  const begun = await deps.db.rpcAsUser<PaymentRow>(authorization, 'begin_razorpay_payment', {
    p_booking_id: bookingId,
  });
  if (begun.error || !begun.data) {
    return dbErrorResponse(begun.error ?? { message: 'no payment returned' }, 'Could not start a payment for this booking.');
  }
  const payment = begun.data;

  if (payment.currency !== 'INR' || !Number.isSafeInteger(payment.amount_minor)
      || payment.amount_minor < MIN_AMOUNT_MINOR) {
    console.error('[payments-create-order] refusing amount', payment.id, payment.amount_minor, payment.currency);
    return json(422, { error: 'This booking cannot be paid online: its amount is not valid.' });
  }

  let order: RazorpayOrder | null = null;
  if (!payment.provider_order_id) {
    try {
      order = await orderFor(deps.razorpay, payment);
    } catch (e) {
      const kind = e instanceof RazorpayError ? e.kind : 'unknown';
      console.error('[payments-create-order] order failed', payment.id, kind, e instanceof Error ? e.message : e);
      return json(502, { error: 'Razorpay could not start this payment. Please try again.' });
    }

    if (order.amount !== payment.amount_minor || order.currency !== payment.currency) {
      console.error('[payments-create-order] order mismatch', payment.id, order.id, order.amount, order.currency);
      return json(502, { error: 'Razorpay returned an order that does not match this booking.' });
    }
  }

  const prepared = await deps.db.rpcAsService<PaymentRow>('prepare_razorpay_checkout', {
    p_payment_id: payment.id,
    p_customer_id: user.id,
    p_order_id: order?.id ?? null,
    p_order_amount_minor: order?.amount ?? null,
    p_order_currency: order?.currency ?? null,
  });
  if (prepared.error || !prepared.data?.provider_order_id) {
    return dbErrorResponse(prepared.error ?? { message: 'no order recorded' }, 'Could not start a payment for this booking.');
  }

  return json(200, {
    payment_id: prepared.data.id,
    order_id: prepared.data.provider_order_id,
    amount_minor: prepared.data.amount_minor,
    currency: prepared.data.currency,
    key_id: deps.keyId,
  });
}
