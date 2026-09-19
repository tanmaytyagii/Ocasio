import type { ReactNode } from 'react';

/**
 * Status pill. Tone is semantic so a status maps to a meaning, not a colour —
 * the booking and payment badges both feed off this.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-ink-soft border-line-strong',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-300',
  danger: 'bg-red-50 text-red-800 border-red-200',
  brand: 'bg-brand-50 text-brand-800 border-brand-200',
};

export const Badge = ({
  tone = 'neutral',
  children,
  className = '',
  ...rest
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${TONES[tone]} ${className}`}
    {...rest}
  >
    {children}
  </span>
);
