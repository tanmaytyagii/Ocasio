'use client';

export interface AuthOptions {
  google: boolean;
  emailPassword: true;
  localEmailInbox: boolean;
}

export class AuthRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

export async function authPost(path: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    const bootstrap = await fetch('/api/v1/security/session', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!bootstrap.ok) throw new AuthRequestError('SECURITY_UNAVAILABLE', 'We couldn’t prepare a secure request. Please try again.');
    const security: unknown = await bootstrap.json();
    if (!security || typeof security !== 'object' || !('csrfToken' in security) || typeof security.csrfToken !== 'string') {
      throw new AuthRequestError('SECURITY_UNAVAILABLE', 'We couldn’t prepare a secure request. Please try again.');
    }
    const response = await fetch(`/api/v1/auth/${path}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': security.csrfToken },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string'
        ? payload.code : response.status === 429 ? 'TOO_MANY_REQUESTS' : 'REQUEST_FAILED';
      throw new AuthRequestError(code, 'We couldn’t complete this request. Please try again.');
    }
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  } catch (error) {
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError('CONNECTION_FAILED', 'We couldn’t confirm the result. Check your connection and try again.');
  }
}

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof AuthRequestError)) return 'We couldn’t complete this request. Please try again.';
  const messages: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'Your email or password wasn’t recognised. Check both and try again.',
    INVALID_PASSWORD: 'Your email or password wasn’t recognised. Check both and try again.',
    EMAIL_NOT_VERIFIED: 'Please verify your email before signing in. You can request another verification email below.',
    USER_ALREADY_EXISTS: 'An account with this email may already exist. Try signing in or resetting your password.',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account with this email may already exist. Try signing in or resetting your password.',
    PASSWORD_TOO_SHORT: 'Use a password with at least 12 characters.',
    PASSWORD_TOO_LONG: 'Use a password with no more than 128 characters.',
    INVALID_EMAIL: 'Enter a valid email address.',
    INVALID_TOKEN: 'This link is invalid or has expired. Request a new password reset email.',
    TOKEN_EXPIRED: 'This link has expired. Request a new password reset email.',
    INVALID_RESET_TOKEN: 'This link is invalid or has expired. Request a new password reset email.',
    TOO_MANY_REQUESTS: 'There have been too many attempts. Please wait a little before trying again.',
  };
  return messages[error.code] ?? error.message;
}
