/**
 * Payment provider webhook endpoint.
 *
 * This is the ONLY path by which a payment can reach a settled state. The
 * browser cannot do it: process_payment_event() is granted to service_role
 * alone, and is a SECURITY INVOKER function, so even a mistaken grant to
 * `authenticated` would still be stopped by RLS.
 *
 * Responsibilities, in order:
 *   1. verify the provider's signature over the RAW body
 *   2. extract event id, type and provider payment reference
 *   3. hand off to the database, which owns idempotency and state rules
 *
 * It deliberately contains no business logic. Whether a late failure can
 * unsettle a paid payment, or whether a redelivered event applies twice, is
 * decided in SQL where it can be tested and cannot be bypassed.
 *
 * ---------------------------------------------------------------------------
 * WHERE A REAL PROVIDER PLUGS IN
 * ---------------------------------------------------------------------------
 * Replace `verifySignature` and `parseEvent` with the provider's scheme. For
 * Razorpay that is an HMAC-SHA256 of the raw body keyed by the webhook secret,
 * compared against the `x-razorpay-signature` header, and their event names
 * (`payment.captured`, `payment.failed`) mapped to ours. Nothing else here or
 * in the database changes.
 *
 * Required environment (set with `supabase secrets set`, never in .env):
 *   PAYMENT_WEBHOOK_SECRET   provider signing secret
 *   SUPABASE_URL             injected by the platform
 *   SUPABASE_SERVICE_ROLE_KEY injected by the platform — server-side only,
 *                            never exposed to Vite or the browser
 *
 * NOTE: this function is not covered by the automated suite, which exercises
 * process_payment_event() directly. Signature verification below is unit-tested
 * in tests/webhook-signature.test.ts.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'test';

/** Constant-time compare, so a wrong signature cannot be found byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verifies the signature over the RAW body. Re-serialising would change it. */
async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
  // No secret configured means we cannot verify anything. Fail closed.
  if (!secret || !signature) return false;
  return timingSafeEqual(await hmacSha256Hex(secret, rawBody), signature);
}

interface ProviderEvent {
  eventId: string;
  eventType: string;
  providerPaymentId: string;
}

function parseEvent(body: Record<string, unknown>): ProviderEvent | null {
  const eventId = typeof body.event_id === 'string' ? body.event_id : null;
  const eventType = typeof body.event_type === 'string' ? body.event_type : null;
  const providerPaymentId =
    typeof body.provider_payment_id === 'string' ? body.provider_payment_id : null;

  if (!eventId || !eventType || !providerPaymentId) return null;
  return { eventId, eventType, providerPaymentId };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-ocasio-signature');

  if (!(await verifySignature(rawBody, signature))) {
    // No detail: a precise reason helps an attacker calibrate.
    return new Response(JSON.stringify({ error: 'invalid signature' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let parsed: ProviderEvent | null;
  try {
    parsed = parseEvent(JSON.parse(rawBody));
  } catch {
    return new Response(JSON.stringify({ error: 'malformed body' }), { status: 400 });
  }
  if (!parsed) {
    return new Response(JSON.stringify({ error: 'missing event fields' }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc('process_payment_event', {
    p_provider: PROVIDER,
    p_provider_event_id: parsed.eventId,
    p_event_type: parsed.eventType,
    p_provider_payment_id: parsed.providerPaymentId,
    p_signature_verified: true,
    p_payload: {},
  });

  if (error) {
    console.error('[payments-webhook]', error.code, error.message);
    return new Response(JSON.stringify({ error: 'could not process event' }), { status: 500 });
  }

  // process_payment_event returns a composite type, so an unmatched reference
  // comes back as an object of nulls rather than JSON null — the absence of an
  // id is the signal, not `data === null`.
  //
  // 404 rather than 200 on purpose: the usual cause is the webhook overtaking
  // our own payment insert, and a non-2xx is what makes the provider retry.
  // The delivery is already recorded, and the retry will apply it.
  const applied = (data as { id?: string | null } | null)?.id ?? null;
  if (!applied) {
    return new Response(JSON.stringify({ error: 'no matching payment yet' }), { status: 404 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
