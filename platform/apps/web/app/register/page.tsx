import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth-shell';
import { AuthForm } from '../../components/auth-form';

export const metadata: Metadata = { title: 'Create an account', robots: { index: false, follow: false } };
export default function RegisterPage() {
  return <AuthShell eyebrow="A place to begin" title="Make yourself at home." description="Create your Ocasio account and verify your email. This account does not make event services available for booking."><AuthForm mode="register" /></AuthShell>;
}
