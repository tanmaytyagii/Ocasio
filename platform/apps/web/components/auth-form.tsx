'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthRequestError, authErrorMessage, authPost, type AuthOptions } from '../lib/auth-client';

type FormMode = 'sign-in' | 'register' | 'forgot-password' | 'reset-password';

export function AuthForm({ mode, token, linkError }: { mode: FormMode; token?: string; linkError?: string }) {
  const [options, setOptions] = useState<AuthOptions | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [finished, setFinished] = useState(false);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const isReset = mode === 'reset-password';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot-password';
  const invalidReset = isReset && (!token || !!linkError);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/auth-options', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Options unavailable');
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object' || !('google' in value) || !('emailPassword' in value)
          || !('localEmailInbox' in value) || typeof value.google !== 'boolean' || value.emailPassword !== true
          || typeof value.localEmailInbox !== 'boolean') throw new Error('Invalid options');
        setOptions({ google: value.google, emailPassword: true, localEmailInbox: value.localEmailInbox });
      }).catch(() => { if (!controller.signal.aborted) setOptionsFailed(true); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || invalidReset) return;
    setError(''); setNotice(''); setVerificationNeeded(false);
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    if (isRegister && !String(data.get('name') ?? '').trim()) {
      setError('Please enter your name.'); return;
    }
    if ((isRegister || isReset) && password !== String(data.get('confirmPassword') ?? '')) {
      setError('Your passwords don’t match. Please enter them again.'); return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        await authPost('sign-up/email', { name: String(data.get('name') ?? '').trim(), email: email.trim(), password, callbackURL: '/account' });
        setFinished(true);
        setNotice('Check your email to verify your account. Once verified, you can sign in.');
      } else if (isForgot) {
        await authPost('request-password-reset', { email: email.trim(), redirectTo: '/reset-password' });
        setNotice('If an account exists for this email, you’ll receive a password reset link. Please check your inbox.');
        setFinished(true);
      } else if (isReset) {
        await authPost('reset-password', { newPassword: password, token });
        setFinished(true); setNotice('Your password has been updated. Sign in with your new password.');
      } else {
        await authPost('sign-in/email', { email: email.trim(), password, callbackURL: '/account' });
        window.location.assign('/account');
        return;
      }
    } catch (failure) {
      setError(authErrorMessage(failure));
      if (failure instanceof AuthRequestError && failure.code === 'EMAIL_NOT_VERIFIED') setVerificationNeeded(true);
    } finally { setBusy(false); }
  }

  async function resendVerification() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await authPost('send-verification-email', { email: email.trim(), callbackURL: '/account' });
      setNotice('If this account needs verification, a new link will be sent. Please check your inbox.');
    } catch (failure) { setError(authErrorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function googleSignIn() {
    if (busy || !options?.google) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await authPost('sign-in/social', { provider: 'google', callbackURL: '/account', errorCallbackURL: '/sign-in?error=google' });
      if (typeof result.url !== 'string') throw new Error('Invalid redirect');
      const destination = new URL(result.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'accounts.google.com' || destination.username || destination.password || destination.port) {
        throw new Error('Untrusted redirect');
      }
      window.location.assign(destination.href);
    } catch (failure) { setError(failure instanceof AuthRequestError ? authErrorMessage(failure) : 'We couldn’t open Google sign-in. Please try again.'); setBusy(false); }
  }

  return <div className="auth-card">
    {linkError && !isReset && <p className="form-feedback form-error" role="alert">{linkError === 'google' ? 'Google sign-in wasn’t completed. You can try again or use your email.' : 'This sign-in link could not be completed. Please sign in or request a new verification email.'}</p>}
    {invalidReset ? <div className="form-feedback form-error" role="alert"><h2>This reset link isn’t valid.</h2><p>It may be incomplete or expired. Request a new email to reset your password.</p><Link className="text-link" href="/forgot-password">Request a new reset link <span aria-hidden="true">↗</span></Link></div> : <>
      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      {notice && <p className="form-feedback form-notice" role="status">{notice}</p>}
      {!finished && <form onSubmit={submit} className="auth-form" aria-busy={busy}>
        {isRegister && <div className="form-field"><label htmlFor="name">Your name</label><input id="name" name="name" autoComplete="name" required maxLength={120} disabled={busy} /></div>}
        {!isReset && <div className="form-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></div>}
        {!isForgot && <div className="form-field"><label htmlFor="password">{isReset ? 'New password' : 'Password'}</label><input id="password" name="password" type="password" autoComplete={isRegister || isReset ? 'new-password' : 'current-password'} required minLength={isRegister || isReset ? 12 : undefined} maxLength={128} disabled={busy} aria-describedby={isRegister || isReset ? 'password-help' : undefined} />{(isRegister || isReset) && <p className="field-help" id="password-help">Use 12–128 characters. A unique password helps keep your account secure.</p>}</div>}
        {(isRegister || isReset) && <div className="form-field"><label htmlFor="confirmPassword">Confirm {isReset ? 'new ' : ''}password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} /></div>}
        {mode === 'sign-in' && <Link className="form-secondary-link" href="/forgot-password">Forgot your password?</Link>}
        <button className="button auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : isForgot ? 'Send reset link' : isReset ? 'Save new password' : 'Sign in'}<span aria-hidden="true">↗</span></button>
      </form>}
      {(verificationNeeded || (finished && isRegister)) && <button className="text-link resend-link" type="button" onClick={resendVerification} disabled={busy}>{busy ? 'Please wait…' : 'Send another verification email'}</button>}
      {finished && <Link className="text-link auth-finished-link" href="/sign-in">Continue to sign in <span aria-hidden="true">↗</span></Link>}
      {!isForgot && !isReset && !finished && <div className="social-section"><div className="form-divider"><span>or</span></div><button className="google-button" onClick={googleSignIn} disabled={busy || !options?.google} type="button"><span className="google-mark" aria-hidden="true">G</span>Continue with Google</button>{!options?.google && <p className="field-help">{optionsFailed ? 'We couldn’t check Google sign-in availability. You can still use email, or refresh this page.' : options ? 'Google sign-in isn’t configured for this environment yet. Please use email.' : 'Checking Google sign-in availability…'}</p>}</div>}
      {options?.localEmailInbox && <p className="local-email-note">Local development: verification and reset messages go to the development inbox rather than your personal inbox. <a href="http://127.0.0.1:8035" target="_blank" rel="noopener noreferrer">Open development inbox <span aria-hidden="true">↗</span></a></p>}
      <div className="auth-alternative">{isRegister ? <p>Already have an account? <Link href="/sign-in">Sign in</Link></p> : mode === 'sign-in' ? <p>New to Ocasio? <Link href="/register">Create an account</Link></p> : !finished ? <p><Link href="/sign-in">Back to sign in</Link></p> : null}</div>
    </>}
  </div>;
}
