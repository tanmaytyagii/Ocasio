'use client';

import { useState } from 'react';
import { authErrorMessage, authPost } from '../lib/auth-client';

export function AccountActions({ email, verified }: { email: string; verified: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function signOut() {
    setBusy(true); setError(''); setNotice('');
    try { await authPost('sign-out'); window.location.assign('/sign-in'); }
    catch (failure) { setError(authErrorMessage(failure)); setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError(''); setNotice('');
    try { await authPost('send-verification-email', { email, callbackURL: '/account' }); setNotice('If verification is needed, a new email will be sent. Please check your inbox.'); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <div className="account-actions">{error && <p role="alert" className="form-feedback form-error">{error}</p>}{notice && <p role="status" className="form-feedback form-notice">{notice}</p>}<div className="account-action-row">{!verified && <button className="button" onClick={verify} disabled={busy}>Send verification email</button>}<button className="text-link" onClick={signOut} disabled={busy}>{busy ? 'Please wait…' : 'Sign out'}</button></div></div>;
}
