/**
 * Response helpers shared by the payment functions.
 *
 * Browser-facing functions are called cross-origin from the site, so they
 * answer CORS preflights. `*` is acceptable because authorisation is a bearer
 * token in a header, never a cookie: another origin gains nothing it could not
 * already do with the token.
 */
import type { DbError } from './db.ts';

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(status: number, body: unknown, cors = true): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(cors ? CORS_HEADERS : {}) },
  });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * Constant-time string comparison, so a secret cannot be recovered byte by
 * byte from response timing. Lengths are compared first; they are not secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * True only when the request carries the service-role key itself.
 *
 * For functions that only the scheduler or an operator may call. Supabase's
 * gateway JWT check is not enough for that: the public anon key is a valid JWT
 * too, so with verification alone anyone holding the site's anon key could
 * call the function.
 */
export function hasServiceRoleKey(req: Request, serviceRoleKey: string | null | undefined): boolean {
  if (!serviceRoleKey) return false;
  const match = /^Bearer\s+(\S+)$/i.exec((req.headers.get('authorization') ?? '').trim());
  return match !== null && constantTimeEqual(match[1], serviceRoleKey);
}

/** The `Authorization: Bearer …` header, or null. */
export function bearer(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  return /^Bearer\s+\S+/i.test(header) ? header : null;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/**
 * Maps a database error to a response. The payment functions' own messages
 * are written for people and pass through; anything else is logged and
 * replaced with `fallback`, so a constraint name or a column never reaches a
 * browser.
 */
export function dbErrorResponse(error: DbError, fallback: string): Response {
  switch (error.code) {
    case 'P0002':
      return json(404, { error: error.message });
    case '42501':
      return json(403, { error: error.message });
    case '22023':
      return json(409, { error: error.message });
    case '23505':
      return json(409, { error: 'A payment is already in progress for this booking.' });
    case '23514':
      return json(422, { error: 'This booking cannot be paid online.' });
    default:
      console.error('[payments] database error', error.code ?? '', error.message);
      return json(500, { error: fallback });
  }
}
