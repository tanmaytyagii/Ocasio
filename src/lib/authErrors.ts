/**
 * User-facing text for authentication failures.
 *
 * Supabase and GoTrue report in their own vocabulary — "Invalid login
 * credentials", "User already registered", Postgres constraint names on the
 * way through. None of that belongs on screen, so every branch here returns a
 * fixed string and the technical detail goes to the console, the same contract
 * services/vendors.ts already follows.
 *
 * Two of these mappings are deliberate rather than cosmetic:
 *
 *   - a failed sign-in never says which half was wrong, because "no account
 *     with that email" tells an attacker which addresses are worth attacking;
 *   - a failed sign-up never confirms that an address is taken, for the same
 *     reason, and points at sign-in instead so a real person is not stuck.
 */

/**
 * Mirrors `auth.minimum_password_length` in supabase/config.toml. The database
 * is what enforces it; this is only what we say and what the field asks for.
 */
export const MIN_PASSWORD_LENGTH = 6;

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

const RATE_LIMITED = 'Too many attempts. Please wait a minute and try again.';

function describe(error: unknown): { status: number | null; message: string } {
  if (!error || typeof error !== 'object') return { status: null, message: '' };

  const { status, message } = error as { status?: unknown; message?: unknown };
  return {
    status: typeof status === 'number' ? status : null,
    message: typeof message === 'string' ? message : '',
  };
}

function rateLimited(status: number | null, message: string): boolean {
  return status === 429 || /rate limit|too many requests|for security purposes/i.test(message);
}

export function signInErrorMessage(error: unknown): string {
  const { status, message } = describe(error);

  if (rateLimited(status, message)) return RATE_LIMITED;
  if (/invalid login credentials|invalid credentials|invalid grant/i.test(message)) {
    return 'Email or password is incorrect.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Confirm your email address first — check your inbox for the link we sent you.';
  }

  return GENERIC_AUTH_ERROR;
}

export function signUpErrorMessage(error: unknown): string {
  const { status, message } = describe(error);

  if (rateLimited(status, message)) return RATE_LIMITED;
  if (/already registered|already exists|user_already_exists/i.test(message)) {
    return "We couldn't create an account with that email. If you already have one, sign in instead.";
  }
  if (/signups? (are |is )?(not allowed|disabled)/i.test(message)) {
    return 'New accounts are not being accepted at the moment.';
  }
  if (/password/i.test(message)) {
    return `Choose a longer password — at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/email/i.test(message)) {
    return 'Enter a valid email address.';
  }

  return GENERIC_AUTH_ERROR;
}
