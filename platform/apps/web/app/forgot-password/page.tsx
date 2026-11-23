import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth-shell';
import { AuthForm } from '../../components/auth-form';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false, follow: false } };
export default function ForgotPasswordPage() {
  return <AuthShell eyebrow="Account recovery" title="Let’s find your way back." description="Enter your email and we’ll send reset instructions if an account exists. For privacy, the confirmation is the same either way."><AuthForm mode="forgot-password" /></AuthShell>;
}
