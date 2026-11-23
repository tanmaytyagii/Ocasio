import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth-shell';
import { AuthForm } from '../../components/auth-form';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false, follow: false } };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[]; error?: string | string[] }> }) {
  const query = await searchParams;
  return <AuthShell eyebrow="A fresh start" title="Choose a new password." description="Use a unique password for your Ocasio account. You’ll sign in again after saving it."><AuthForm mode="reset-password" token={typeof query.token === 'string' ? query.token : undefined} linkError={typeof query.error === 'string' ? query.error : undefined} /></AuthShell>;
}
