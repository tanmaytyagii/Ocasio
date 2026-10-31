/**
 * payments-webhook: Razorpay's notifications, and the only path by which a
 * payment or refund reaches a final state.
 *
 *   1. Verify X-Razorpay-Signature over the RAW body (HMAC-SHA256, the webhook
 *      secret). Nothing is parsed, logged or stored before this passes.
 *   2. Parse strictly. A supported event of the wrong shape is refused rather
 *      than guessed at.
 *   3. Hand identifiers, amounts and the outcome to the database, keyed by
 *      x-razorpay-event-id. Razorpay delivers at least once and not always in
 *      order; the database functions make duplicates no-ops and refuse
 *      transitions that a late event would get wrong.
 *
 * Status codes are chosen for Razorpay's retry policy: any non-2xx is retried
 * for 24 hours, after which the webhook is DISABLED. So a non-2xx is returned
 * only when a retry can help — a bad signature, a database error, a refund
 * whose capture has not been recorded yet. Events that can never apply here
 * (an order Ocasio did not create, an event type it does not use) are recorded
 * where relevant and acknowledged, so they cannot switch the webhook off.
 */
import type { Db } from './db.ts';
import { json } from './http.ts';
import { eventRecord, parseWebhookEvent, verifyWebhookSignature, webhookEventId } from './razorpay.ts';

export interface WebhookDeps {
  db: Db;
  /** RAZORPAY_WEBHOOK_SECRET. Without it every delivery is refused. */
  webhookSecret: string | null;
}

/** Composite results come back as an object of nulls when nothing matched. */
const matched = (data: unknown) => Boolean((data as { id?: string | null } | null)?.id);

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, false);

  if (!deps.webhookSecret) {
    console.error('[payments-webhook] RAZORPAY_WEBHOOK_SECRET is not set; refusing every delivery');
    return json(503, { error: 'not configured' }, false);
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  if (!(await verifyWebhookSignature(rawBody, signature, deps.webhookSecret))) {
    // No detail: a precise reason helps an attacker calibrate.
    return json(401, { error: 'invalid signature' }, false);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'malformed body' }, false);
  }

  const event = parseWebhookEvent(body);
  if (!event) {
    console.error('[payments-webhook] supported event with an unexpected shape');
    return json(400, { error: 'unrecognised event' }, false);
  }
  if (event.kind === 'ignored') {
    return json(200, { ignored: event.type }, false);
  }

  const eventId = await webhookEventId(req.headers.get('x-razorpay-event-id'), rawBody);
  const payload = eventRecord(event);

  if (event.kind === 'payment') {
    const { data, error } = await deps.db.rpcAsService('process_razorpay_payment_event', {
      p_event_id: eventId,
      p_event_type: event.type,
      p_order_id: event.orderId,
      p_provider_payment_id: event.paymentId,
      p_amount_minor: event.amount,
      p_currency: event.currency,
      p_signature_verified: true,
      p_payload: payload,
    });
    if (error) {
      console.error('[payments-webhook] payment event failed', eventId, error.code ?? '', error.message);
      return json(500, { error: 'could not process event' }, false);
    }
    return json(200, matched(data) ? { received: true } : { ignored: 'no matching payment' }, false);
  }

  const { data, error } = await deps.db.rpcAsService('process_razorpay_refund_event', {
    p_event_id: eventId,
    p_event_type: event.type,
    p_provider_refund_id: event.refundId,
    p_provider_payment_id: event.paymentId,
    p_order_id: event.orderId,
    p_refund_reference: event.reference,
    p_amount_minor: event.amount,
    p_currency: event.currency,
    p_signature_verified: true,
    p_payload: payload,
  });
  if (error) {
    // 55000: the refund overtook its payment's capture. Razorpay will resend.
    const status = error.code === '55000' ? 503 : 500;
    console.error('[payments-webhook] refund event failed', eventId, error.code ?? '', error.message);
    return json(status, { error: 'could not process event' }, false);
  }
  return json(200, matched(data) ? { received: true } : { ignored: 'nothing to apply' }, false);
}
