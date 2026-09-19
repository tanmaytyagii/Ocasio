/**
 * Webhook signature verification.
 *
 * The edge function itself runs on Deno and is not exercised by this suite, so
 * the part that actually gates access — the HMAC comparison — is tested here
 * against the same Web Crypto API it uses. If this logic is wrong, an attacker
 * can forge settlement events, so it is worth testing separately from the
 * database rules.
 *
 * Kept byte-identical to supabase/functions/payments-webhook/index.ts.
 */
import { describe, expect, it } from 'vitest';

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

async function verifySignature(
  secret: string | undefined,
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!secret || !signature) return false;
  return timingSafeEqual(await hmacSha256Hex(secret, rawBody), signature);
}

const SECRET = 'test-webhook-secret';
const BODY = JSON.stringify({
  event_id: 'evt_1',
  event_type: 'payment.succeeded',
  provider_payment_id: 'pp_1',
});

describe('webhook signature verification', () => {
  it('accepts a correctly signed body', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifySignature(SECRET, BODY, sig)).toBe(true);
  });

  it('rejects a body that was tampered with after signing', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    const tampered = BODY.replace('pp_1', 'pp_victim');
    expect(await verifySignature(SECRET, tampered, sig)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const sig = await hmacSha256Hex('not-the-secret', BODY);
    expect(await verifySignature(SECRET, BODY, sig)).toBe(false);
  });

  it('rejects a missing signature', async () => {
    expect(await verifySignature(SECRET, BODY, null)).toBe(false);
  });

  it('fails closed when no secret is configured', async () => {
    // A misconfigured deployment must reject everything rather than wave it
    // through, which is the difference between an outage and an open door.
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifySignature(undefined, BODY, sig)).toBe(false);
  });

  it('rejects a truncated signature without throwing', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifySignature(SECRET, BODY, sig.slice(0, 10))).toBe(false);
  });

  it('is deterministic for the same secret and body', async () => {
    expect(await hmacSha256Hex(SECRET, BODY)).toBe(await hmacSha256Hex(SECRET, BODY));
  });
});
