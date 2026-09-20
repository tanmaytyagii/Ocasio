/**
 * Where to send someone once they have authenticated.
 *
 * Sign-in is the one screen in the product that takes a destination from
 * untrusted input. Route guards put the intended location in router state
 * (RouteGuards, BookingRequestForm, BecomeVendor, FavoritesContext), and a
 * link can put one in the query string. Either can be forged, so neither is
 * trusted: only a same-origin path ever comes back out of here.
 *
 * Rejected deliberately:
 *
 *   https://evil.test      an absolute URL
 *   //evil.test            protocol-relative — a browser reads it as a host
 *   /\evil.test            browsers normalise the backslash to a slash
 *   /%2F%2Fevil.test       decodes back into a protocol-relative URL
 *   javascript:…           not a path at all
 *   /auth, /auth/…         would bounce the user back to the page they just left
 *
 * Whatever survives is re-serialised from a parsed URL, so callers receive a
 * normalised `/path?query#hash` rather than the string that was handed in.
 */

/** Where an unusable or missing return path lands. */
export const DEFAULT_RETURN_PATH = '/';

/**
 * A base that no real request can share. Anything in the candidate that escapes
 * the path — a scheme, an authority — produces a different origin, which is the
 * check below.
 */
const OPAQUE_BASE = 'http://ocasio.invalid';

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;

  // Control characters, including the tab and newline browsers strip out of a
  // URL before resolving it. Rejected rather than stripped: a value that needs
  // cleaning is not a value we should be following.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;

  if (raw[0] !== '/') return null;
  // "//host" and "/\host" are both authority-relative to a browser.
  if (raw[1] === '/' || raw[1] === '\\') return null;

  let url: URL;
  try {
    url = new URL(raw, OPAQUE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== OPAQUE_BASE) return null;

  // A percent-encoded path can still carry an authority past the checks above.
  if (url.pathname.startsWith('//')) return null;

  // Returning to /auth would put the user back where they just came from.
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Rebuilds a path from the router Location stored in navigation state.
 *
 * The query string and hash are kept. They were dropped before this — sign-in
 * read `from.pathname` alone, so a visitor sent away from
 * `/search?category=Catering` came back to an unfiltered `/search`.
 */
export function pathFromLocationState(from: unknown): string | null {
  if (!from || typeof from !== 'object') return null;

  const { pathname, search, hash } = from as {
    pathname?: unknown;
    search?: unknown;
    hash?: unknown;
  };
  if (typeof pathname !== 'string') return null;

  return safeReturnPath(
    `${pathname}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`,
  );
}

/**
 * The destination for this visit to /auth.
 *
 * Router state first, because that is what every guard in the product already
 * sets. The `next` query parameter is the fallback, so a reload — which throws
 * away history state — does not silently drop the destination.
 */
export function resolveReturnPath(state: unknown, search: string): string {
  const fromState = pathFromLocationState(
    state && typeof state === 'object' ? (state as { from?: unknown }).from : null,
  );
  if (fromState) return fromState;

  let next: string | null = null;
  try {
    next = new URLSearchParams(search).get('next');
  } catch {
    next = null;
  }

  return safeReturnPath(next) ?? DEFAULT_RETURN_PATH;
}

/**
 * The short phrase explaining why someone was sent here, if a caller supplied
 * one — FavoritesContext sends `intent: 'save this vendor'`.
 *
 * Rendered as text, so it is escaped by React; the cap is there so a long value
 * cannot push the heading off the screen.
 */
export function returnIntent(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const intent = (state as { intent?: unknown }).intent;
  if (typeof intent !== 'string') return null;

  const trimmed = intent.trim();
  if (trimmed === '' || trimmed.length > 60) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  return trimmed;
}
