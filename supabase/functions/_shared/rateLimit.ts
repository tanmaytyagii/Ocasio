/**
 * Per-user request budgets for the browser-facing payment functions
 * (docs/SECURITY_AUDIT.md, F-17).
 *
 * Counted in Postgres by consume_rate_limit(), because edge functions run as
 * many short-lived instances and an in-memory counter would see only one of
 * them. Called with the service role and the user id Supabase Auth verified,
 * so a browser cannot spend or reset anyone's budget.
 *
 * The limits are generous for a person — a customer retrying Checkout, a
 * vendor issuing refunds — and small for a script.
 */
import type { Db } from './db.ts';
import { CORS_HEADERS, json } from './http.ts';

export interface RateLimit {
  max: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  'payments-create-order': { max: 20, windowSeconds: 600 },
  'payments-refund': { max: 10, windowSeconds: 600 },
} as const satisfies Record<string, RateLimit>;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

interface Verdict {
  allowed: boolean;
  retry_after_seconds: number;
}

/**
 * Spends one request from the user's budget. Returns null when the request may
 * proceed, or the response to send instead: 429 with Retry-After when the
 * budget is spent, 503 when it cannot be checked — failing closed, like every
 * other check in these functions.
 */
export async function spendRateLimit(
  db: Db,
  action: RateLimitedAction,
  userId: string,
  limit: RateLimit = RATE_LIMITS[action],
): Promise<Response | null> {
  const { data, error } = await db.rpcAsService<Verdict[] | Verdict>('consume_rate_limit', {
    p_bucket: `${action}:${userId}`,
    p_max: limit.max,
    p_window_seconds: limit.windowSeconds,
  });
  const verdict = Array.isArray(data) ? data[0] : data;
  if (error || !verdict) {
    console.error(`[${action}] rate limit could not be checked`, error?.message ?? 'no result');
    return json(503, { error: 'This is not available right now. Please try again shortly.' });
  }
  if (verdict.allowed) return null;

  return new Response(
    JSON.stringify({ error: 'Too many attempts. Please wait a few minutes and try again.' }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(verdict.retry_after_seconds),
        ...CORS_HEADERS,
        'access-control-expose-headers': 'retry-after',
      },
    },
  );
}
