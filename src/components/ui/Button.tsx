import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * The one button in Ocasio.
 *
 * Before this, every page hand-rolled `rounded-lg bg-purple-600 px-5 py-2.5
 * text-white hover:bg-purple-700`, with the padding and radius drifting between
 * surfaces. Variants here are semantic — what the button means, not what it
 * looks like.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-card',
  secondary: 'border border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:border-muted',
  ghost: 'text-ink-soft hover:bg-canvas',
  danger: 'border border-red-300 bg-surface text-red-700 hover:bg-red-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-control font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

/** A link that looks like a button. Same tokens, correct semantics. */
export const ButtonLink = ({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className = '',
  children,
  ...rest
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'to' | 'className' | 'children'>) => (
  <Link
    to={to}
    className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    {...rest}
  >
    {children}
  </Link>
);
