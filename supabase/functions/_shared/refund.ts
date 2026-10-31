/**
 * payments-refund: issues a Razorpay refund for a settled payment.
 *
 *   1. Authenticate the caller from their bearer token.
 *   2. create_razorpay_refund(), with the service role and the authenticated
 *      user as the actor: the database decides whether they may refund (vendor
 *      owner or admin), checks the payment is settled, and reserves the amount
 *      against what has not been refunded or requested already. The same
 *      idempotency key returns the same refund.
 *   3. Claim the submission, so concurrent requests for one refund do not both
 *      reach Razorpay.
 *   4. Ask Razorpay for the refund with Ocasio's refund id as the receipt —
 *      Razorpay's idempotency key — so even a resent request cannot refund
 *      twice.
 *   5. Record Razorpay's refund id. The refund stays pending: an accepted
 *      request is not a completed refund. refund.processed completes it.
 *
 * When a call fails, the receipt is checked first: a request that timed out may
 * have created the refund anyway, and declaring it failed would leave the
 * books saying "not refunded" while the money went back.
 */
import type { Db } from './db.ts';
import { RazorpayError, type RazorpayApi, type RazorpayRefund } from './razorpay.ts';
import { UUID, bearer, dbErrorResponse, json, preflight, readJson } from './http.ts';
import { type RateLimit, spendRateLimit } from './rateLimit.ts';

export interface RefundDeps {
  db: Db;
  razorpay: RazorpayApi | null;
  /** Defaults to RATE_LIMITS['payments-refund']. */
  rateLimit?: RateLimit;
}

interface RefundRow {
  id: string;
  payment_id: string;
  amount_minor: number;
  status: string;
  provider_refund_id: string | null;
}

interface Claim {
  claimed: boolean;
  refund_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  payment_id: string;
  provider_payment_id: string;
  provider_refund_id: string | null;
}

/** Razorpay's minimum refund is ₹1.00. */
const MIN_AMOUNT_MINOR = 100;
const KEY = /^[A-Za-z0-9:._-]{8,200}$/;

const view = (refund: Pick<RefundRow, 'id' | 'status' | 'amount_minor' | 'provider_refund_id'>) => ({
  id: refund.id,
  status: refund.status,
  amount_minor: refund.amount_minor,
  provider_refund_id: refund.provider_refund_id,
});

async function findByReceipt(razorpay: RazorpayApi, claim: Claim): Promise<RazorpayRefund | null> {
  try {
    return await razorpay.findRefundByReceipt(claim.provider_payment_id, claim.refund_id);
  } catch (e) {
    console.error('[payments-refund] receipt lookup failed', claim.refund_id, e instanceof Error ? e.message : e);
    return null;
  }
}

async function submit(deps: { db: Db; razorpay: RazorpayApi }, refundId: string): Promise<Response> {
  const claimed = await deps.db.rpcAsService<Claim>('claim_razorpay_refund_submission', { p_refund_id: refundId });
  if (claimed.error || !claimed.data) {
    return dbErrorResponse(claimed.error ?? { message: 'no claim returned' }, 'Could not send this refund.');
  }
  const claim = claimed.data;

  // Already sent, already settled, or another request is sending it now.
  if (!claim.claimed) {
    return json(202, {
      refund: view({ id: claim.refund_id, status: claim.status, amount_minor: claim.amount_minor,
                     provider_refund_id: claim.provider_refund_id }),
      submitted: claim.provider_refund_id !== null,
    });
  }

  let refund: RazorpayRefund | null = null;
  try {
    refund = await deps.razorpay.createRefund(claim.provider_payment_id, {
      amount: claim.amount_minor,
      receipt: claim.refund_id,
      notes: { ocasio_refund_id: claim.refund_id, ocasio_payment_id: claim.payment_id },
    });
  } catch (e) {
    const error = e instanceof RazorpayError
      ? e
      : new RazorpayError('retryable', 0, e instanceof Error ? e.message : String(e));

    refund = await findByReceipt(deps.razorpay, claim);

    if (!refund && error.kind === 'rejected') {
      const failed = await deps.db.rpcAsService<RefundRow>('fail_razorpay_refund_submission', {
        p_refund_id: claim.refund_id,
        p_reason: error.message,
      });
      console.error('[payments-refund] rejected by Razorpay', claim.refund_id, error.code ?? '', error.message);
      return json(422, {
        error: 'Razorpay declined this refund, so no money was returned. The amount is available to refund again.',
        refund: failed.data ? view(failed.data) : null,
      });
    }

    if (!refund) {
      await deps.db.rpcAsService('release_razorpay_refund_submission', {
        p_refund_id: claim.refund_id,
        p_reason: `${error.kind}: ${error.message}`,
      });
      console.error('[payments-refund] not sent', claim.refund_id, error.kind, error.message);
      return json(503, {
        error: 'Razorpay could not be reached. The refund is saved — send it again in a moment.',
      });
    }
  }

  if (refund.payment_id !== claim.provider_payment_id || refund.amount !== claim.amount_minor
      || refund.currency !== claim.currency) {
    // Not the refund that was asked for. Do not record it; the webhook will
    // report whatever really happened, and the mismatch is logged for review.
    console.error('[payments-refund] refund mismatch', claim.refund_id, refund.id, refund.amount, refund.currency);
    await deps.db.rpcAsService('release_razorpay_refund_submission', {
      p_refund_id: claim.refund_id,
      p_reason: `mismatched provider refund ${refund.id}`,
    });
    return json(502, { error: 'Razorpay returned a refund that does not match this request.' });
  }

  const recorded = await deps.db.rpcAsService<RefundRow>('record_razorpay_refund_submission', {
    p_refund_id: claim.refund_id,
    p_provider_refund_id: refund.id,
    p_amount_minor: refund.amount,
    p_currency: refund.currency,
  });
  if (recorded.error || !recorded.data) {
    return dbErrorResponse(recorded.error ?? { message: 'no refund returned' }, 'Could not record this refund.');
  }

  return json(202, { refund: view(recorded.data), submitted: true });
}

export async function handleRefund(req: Request, deps: RefundDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  if (!deps.razorpay) {
    console.error('[payments-refund] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
    return json(503, { error: 'Refunds are not available right now.' });
  }

  const authorization = bearer(req);
  if (!authorization) return json(401, { error: 'Sign in to issue a refund.' });

  const user = await deps.db.userFor(authorization);
  if (!user) return json(401, { error: 'Your session has expired. Sign in again.' });

  const limited = await spendRateLimit(deps.db, 'payments-refund', user.id, deps.rateLimit);
  if (limited) return limited;

  const body = await readJson(req);
  const paymentId = body?.payment_id;
  const amount = body?.amount_minor;
  const key = body?.idempotency_key;
  const reason = body?.reason;

  if (typeof paymentId !== 'string' || !UUID.test(paymentId)) {
    return json(400, { error: 'A payment id is required.' });
  }
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < MIN_AMOUNT_MINOR) {
    return json(400, { error: 'A refund must be a whole amount of at least ₹1.' });
  }
  if (typeof key !== 'string' || !KEY.test(key)) {
    return json(400, { error: 'An idempotency key is required.' });
  }
  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > 500)) {
    return json(400, { error: 'The reason must be 500 characters or fewer.' });
  }

  const created = await deps.db.rpcAsService<RefundRow>('create_razorpay_refund', {
    p_actor_id: user.id,
    p_payment_id: paymentId,
    p_amount_minor: amount,
    p_idempotency_key: key,
    p_reason: typeof reason === 'string' ? reason : null,
  });
  if (created.error || !created.data) {
    return dbErrorResponse(created.error ?? { message: 'no refund returned' }, 'Could not start this refund.');
  }

  return submit({ db: deps.db, razorpay: deps.razorpay }, created.data.id);
}
