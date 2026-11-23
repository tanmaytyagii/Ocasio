import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AccountActions } from '../../components/account-actions';

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } };

interface AccountUser { id: string; name: string; email: string; emailVerified: boolean }

export default async function AccountPage() {
  let user: AccountUser | null = null;
  let unavailable = false;
  try {
    const response = await fetch(new URL('/api/v1/auth/get-session', process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4100'), {
      cache: 'no-store', headers: { cookie: (await cookies()).toString() }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Session unavailable');
    const data: unknown = await response.json();
    if (data !== null) {
      const candidate = typeof data === 'object' && 'user' in data ? data.user : null;
      if (!candidate || typeof candidate !== 'object' || !('id' in candidate) || !('name' in candidate) || !('email' in candidate) || !('emailVerified' in candidate)
        || typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.email !== 'string' || typeof candidate.emailVerified !== 'boolean') throw new Error('Invalid session');
      user = { id: candidate.id, name: candidate.name, email: candidate.email, emailVerified: candidate.emailVerified };
    }
  } catch { unavailable = true; }
  if (unavailable) return <section className="state-page section-shell"><p className="eyebrow">Account temporarily unavailable</p><h1>We couldn’t load<br /><em>your account.</em></h1><p>Please try again. This doesn’t mean you’ve been signed out.</p><a className="button" href="/account">Try again <span aria-hidden="true">↗</span></a></section>;
  if (!user) redirect('/sign-in');
  return <section className="account-section section-shell"><div className="account-heading"><p className="eyebrow">Your Ocasio account</p><h1>Hello, <em>{user.name}.</em></h1><p>Your account details, securely connected to your current session.</p></div><div className="account-card"><h2>Account details</h2><dl><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Email verification</dt><dd><span className={user.emailVerified ? 'verification-label verified' : 'verification-label'}>{user.emailVerified ? 'Verified' : 'Not verified'}</span></dd></div></dl><AccountActions email={user.email} verified={user.emailVerified} /></div><div className="account-next"><p>Ocasio is still taking shape. There are no live bookings or order histories in this introduction.</p><Link className="text-link" href="/explore">Explore the idea <span aria-hidden="true">↗</span></Link></div></section>;
}
