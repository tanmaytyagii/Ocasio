/**
 * Razorpay webhook signature verification.
 *
 * Tests the code the payments-webhook function actually runs —
 * supabase/functions/_shared/razorpay.ts, imported directly — not a copy of
 * it. If this logic is wrong, anyone can forge "payment captured" and settle a
 * booking without paying, so it is tested apart from the database rules.
 *
 * Razorpay signs the raw request body: HMAC-SHA256 keyed by the webhook
 * secret, hex-encoded, in X-Razorpay-Signature.
 */
import { describe, expect, it } from 'vitest';
import {
  hmacSha256Hex,
  verifyWebhookSignature,
  webhookEventId,
} from '../supabase/functions/_shared/razorpay.ts';

const SECRET = 'test-webhook-secret';
const BODY = JSON.stringify({
  entity: 'event',
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_TESTabc123', order_id: 'order_TESTabc123', amount: 50000 } } },
});

describe('webhook signature verification', () => {
  it('matches the published HMAC-SHA256 test vector', async () => {
    // The well-known vector, so the primitive is checked against the outside
    // world and not only against itself.
    expect(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('accepts a correctly signed body', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('accepts the signature in upper case and with surrounding whitespace', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(BODY, `  ${sig.toUpperCase()} `, SECRET)).toBe(true);
  });

  it('rejects a body that was tampered with after signing', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    const tampered = BODY.replace('50000', '100');
    expect(await verifyWebhookSignature(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects the same JSON re-serialised: only the raw body verifies', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    const reformatted = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(await verifyWebhookSignature(reformatted, sig, SECRET)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const sig = await hmacSha256Hex('not-the-secret', BODY);
    expect(await verifyWebhookSignature(BODY, sig, SECRET)).toBe(false);
  });

  it('rejects a missing signature', async () => {
    expect(await verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
  });

  it('fails closed when no secret is configured', async () => {
    // A misconfigured deployment must reject everything rather than wave it
    // through, which is the difference between an outage and an open door.
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(BODY, sig, undefined)).toBe(false);
    expect(await verifyWebhookSignature(BODY, sig, '')).toBe(false);
  });

  it('rejects truncated, padded and non-hex signatures without throwing', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(BODY, sig.slice(0, 10), SECRET)).toBe(false);
    expect(await verifyWebhookSignature(BODY, `${sig}00`, SECRET)).toBe(false);
    expect(await verifyWebhookSignature(BODY, 'z'.repeat(64), SECRET)).toBe(false);
  });

  it('is deterministic for the same secret and body', async () => {
    expect(await hmacSha256Hex(SECRET, BODY)).toBe(await hmacSha256Hex(SECRET, BODY));
  });
});

describe('webhook event ids', () => {
  it('uses x-razorpay-event-id when present', async () => {
    expect(await webhookEventId('HwXYZ123abc', BODY)).toBe('HwXYZ123abc');
  });

  it('falls back to the body hash, which a redelivery repeats', async () => {
    const first = await webhookEventId(null, BODY);
    expect(first).toMatch(/^body-sha256:[0-9a-f]{64}$/);
    expect(await webhookEventId('', BODY)).toBe(first);
    expect(await webhookEventId(null, `${BODY} `)).not.toBe(first);
  });

  it('does not trust a header that is not an id', async () => {
    expect(await webhookEventId('x'.repeat(500), BODY)).toMatch(/^body-sha256:/);
    expect(await webhookEventId("evt'; drop table", BODY)).toMatch(/^body-sha256:/);
  });
});
