import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETURN_PATH,
  pathFromLocationState,
  resolveReturnPath,
  returnIntent,
  safeReturnPath,
} from '../src/lib/returnPath';
import {
  GENERIC_AUTH_ERROR,
  signInErrorMessage,
  signUpErrorMessage,
} from '../src/lib/authErrors';

/**
 * Sign-in decides where to send someone from input it does not control, and
 * says why their attempt failed without saying too much. Both are the kind of
 * thing that is fine until it is a CVE, so both are pinned here.
 *
 * Pure functions, so no database and no browser — unlike the rest of tests/,
 * this file talks to nothing.
 */

describe('safeReturnPath', () => {
  it('accepts an ordinary internal path', () => {
    expect(safeReturnPath('/bookings')).toBe('/bookings');
    expect(safeReturnPath('/vendors/capture-moments')).toBe('/vendors/capture-moments');
  });

  it('keeps the query string and the hash', () => {
    expect(safeReturnPath('/search?category=Catering&location=Mumbai')).toBe(
      '/search?category=Catering&location=Mumbai',
    );
    expect(safeReturnPath('/vendors/royal-caterers#reviews')).toBe(
      '/vendors/royal-caterers#reviews',
    );
  });

  it('rejects an absolute URL', () => {
    expect(safeReturnPath('https://evil.test/steal')).toBeNull();
    expect(safeReturnPath('http://evil.test')).toBeNull();
  });

  it('rejects a protocol-relative URL, which a browser reads as a host', () => {
    expect(safeReturnPath('//evil.test')).toBeNull();
    expect(safeReturnPath('//evil.test/bookings')).toBeNull();
  });

  it('rejects a backslash-smuggled host', () => {
    // Browsers normalise the backslash to a slash before resolving.
    expect(safeReturnPath('/\\evil.test')).toBeNull();
    expect(safeReturnPath('\\\\evil.test')).toBeNull();
  });

  it('rejects an encoded authority', () => {
    // URLSearchParams decodes once on the way in, which is what a crafted
    // ?next= would rely on.
    expect(safeReturnPath(new URLSearchParams('next=%2F%2Fevil.test').get('next'))).toBeNull();
    expect(safeReturnPath(new URLSearchParams('next=/%2F%2Fevil.test').get('next'))).toBeNull();
  });

  it('rejects a non-path scheme', () => {
    expect(safeReturnPath('javascript:alert(1)')).toBeNull();
    expect(safeReturnPath('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeReturnPath('mailto:someone@evil.test')).toBeNull();
  });

  it('rejects control characters rather than stripping them', () => {
    expect(safeReturnPath('/\u0000/bookings')).toBeNull();
    expect(safeReturnPath('/\n/bookings')).toBeNull();
    expect(safeReturnPath('/\t/bookings')).toBeNull();
  });

  it('rejects a relative path with no leading slash', () => {
    expect(safeReturnPath('bookings')).toBeNull();
    expect(safeReturnPath('../admin')).toBeNull();
  });

  it('rejects /auth, which would bounce the user back here', () => {
    expect(safeReturnPath('/auth')).toBeNull();
    expect(safeReturnPath('/auth/callback')).toBeNull();
    expect(safeReturnPath('/auth?next=/bookings')).toBeNull();
  });

  it('rejects anything that is not a non-empty string', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
    expect(safeReturnPath(42)).toBeNull();
    expect(safeReturnPath({ pathname: '/bookings' })).toBeNull();
  });

  it('normalises what it does return', () => {
    // A traversal that stays inside the origin is resolved, not echoed back.
    expect(safeReturnPath('/a/../bookings')).toBe('/bookings');
  });
});

describe('pathFromLocationState', () => {
  it('rebuilds the path a route guard stored', () => {
    expect(pathFromLocationState({ pathname: '/become-vendor', search: '', hash: '' })).toBe(
      '/become-vendor',
    );
  });

  it('keeps the query string, which the previous implementation dropped', () => {
    expect(
      pathFromLocationState({ pathname: '/search', search: '?category=Catering', hash: '' }),
    ).toBe('/search?category=Catering');
  });

  it('survives a state object missing the optional parts', () => {
    expect(pathFromLocationState({ pathname: '/favorites' })).toBe('/favorites');
  });

  it('refuses a forged state object', () => {
    expect(pathFromLocationState({ pathname: 'https://evil.test' })).toBeNull();
    expect(pathFromLocationState({ pathname: '//evil.test' })).toBeNull();
    expect(pathFromLocationState({ pathname: 42 })).toBeNull();
    expect(pathFromLocationState(null)).toBeNull();
    expect(pathFromLocationState('/bookings')).toBeNull();
  });
});

describe('resolveReturnPath', () => {
  it('prefers router state, which is what every guard in the product sets', () => {
    expect(
      resolveReturnPath({ from: { pathname: '/bookings', search: '', hash: '' } }, '?next=/profile'),
    ).toBe('/bookings');
  });

  it('falls back to ?next=, so a reload does not lose the destination', () => {
    expect(resolveReturnPath(null, '?next=%2Ffavorites')).toBe('/favorites');
  });

  it('falls back to the homepage when there is nothing usable', () => {
    expect(resolveReturnPath(null, '')).toBe(DEFAULT_RETURN_PATH);
    expect(resolveReturnPath({}, '')).toBe(DEFAULT_RETURN_PATH);
    expect(resolveReturnPath({ from: { pathname: '//evil.test' } }, '')).toBe(DEFAULT_RETURN_PATH);
  });

  it('never returns an off-site destination from either source', () => {
    expect(resolveReturnPath(null, '?next=https%3A%2F%2Fevil.test')).toBe(DEFAULT_RETURN_PATH);
    expect(resolveReturnPath(null, '?next=%2F%2Fevil.test')).toBe(DEFAULT_RETURN_PATH);
    expect(resolveReturnPath({ from: { pathname: 'https://evil.test' } }, '')).toBe(
      DEFAULT_RETURN_PATH,
    );
  });
});

describe('returnIntent', () => {
  it('reads the phrase FavoritesContext sends', () => {
    expect(returnIntent({ intent: 'save this vendor' })).toBe('save this vendor');
  });

  it('ignores anything that is not a short, clean string', () => {
    expect(returnIntent({ intent: '' })).toBeNull();
    expect(returnIntent({ intent: 'x'.repeat(61) })).toBeNull();
    expect(returnIntent({ intent: 'save\u0000this' })).toBeNull();
    expect(returnIntent({ intent: 12 })).toBeNull();
    expect(returnIntent(null)).toBeNull();
  });
});

describe('signInErrorMessage', () => {
  it('does not say which half of the credentials was wrong', () => {
    const message = signInErrorMessage({ status: 400, message: 'Invalid login credentials' });
    expect(message).toBe('Email or password is incorrect.');
    expect(message).not.toMatch(/no account|not found|unregistered/i);
  });

  it('explains an unconfirmed address, which the user can act on', () => {
    expect(signInErrorMessage({ status: 400, message: 'Email not confirmed' })).toMatch(
      /confirm your email address/i,
    );
  });

  it('names rate limiting rather than blaming the password', () => {
    expect(signInErrorMessage({ status: 429, message: 'Request rate limit reached' })).toMatch(
      /too many attempts/i,
    );
  });

  it('never leaks raw database or GoTrue text', () => {
    const raw = 'duplicate key value violates unique constraint "profiles_pkey"';
    expect(signInErrorMessage({ status: 500, message: raw })).toBe(GENERIC_AUTH_ERROR);
    expect(signInErrorMessage(new TypeError('Failed to fetch'))).toBe(GENERIC_AUTH_ERROR);
    expect(signInErrorMessage('something')).toBe(GENERIC_AUTH_ERROR);
    expect(signInErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  });
});

describe('signUpErrorMessage', () => {
  it('does not confirm that an address already has an account', () => {
    const message = signUpErrorMessage({ status: 422, message: 'User already registered' });
    expect(message).not.toMatch(/already (registered|exists|taken)/i);
    // It still has to be actionable, so it points at the other tab.
    expect(message).toMatch(/sign in/i);
  });

  it('asks for a longer password when that is the problem', () => {
    expect(
      signUpErrorMessage({ status: 422, message: 'Password should be at least 6 characters.' }),
    ).toMatch(/longer password/i);
  });

  it('reports rate limiting', () => {
    expect(
      signUpErrorMessage({ status: 429, message: 'For security purposes, you can only request this after 51 seconds.' }),
    ).toMatch(/too many attempts/i);
  });

  it('never leaks raw text', () => {
    expect(signUpErrorMessage({ status: 500, message: 'relation "auth.users" does not exist' })).toBe(
      GENERIC_AUTH_ERROR,
    );
    expect(signUpErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
  });
});
