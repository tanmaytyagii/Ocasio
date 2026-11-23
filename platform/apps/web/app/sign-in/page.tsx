import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth-shell';
import { AuthForm } from '../../components/auth-form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const query = await searchParams;
  return <AuthShell eyebrow="Your Ocasio account" title="Welcome back." description="Sign in to your account. We’re still building the Ocasio experience; event bookings are not open yet."><AuthForm mode="sign-in" linkError={typeof query.error === 'string' ? query.error : undefined} /></AuthShell>;
}
