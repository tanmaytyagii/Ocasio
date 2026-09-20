import type { InputHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * A text input for the sign-in screen.
 *
 * Deliberately not a change to ui/Field.tsx. That primitive is shared by six
 * other surfaces, and giving every form in the product a leading icon and a
 * 48px control to serve one screen would be the wrong trade. The tokens are
 * the ones TextField already uses — rounded-control, line-strong, surface,
 * brand-500 on focus — so this reads as the same design system at a larger
 * size rather than as a second one.
 *
 * The input is written before the icon so the icon can react to focus through
 * `peer`, which only looks forward. Neither the icon nor the wrapper is
 * focusable, so the tab order is still label → input → trailing control.
 */

export interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Required: every control on this screen is labelled and described by id. */
  id: string;
  icon: LucideIcon;
  /** Rendered over the field — today, the password visibility toggle. */
  trailing?: ReactNode;
}

const AuthField = ({
  label,
  id,
  icon: Icon,
  trailing,
  className = '',
  ...rest
}: AuthFieldProps) => (
  <div>
    <label htmlFor={id} className="block text-[0.8125rem] font-semibold text-ink-soft">
      {label}
    </label>

    <div className="relative mt-2">
      <input
        id={id}
        className={`peer h-12 w-full rounded-control border border-line-strong bg-surface pl-11 ${
          trailing ? 'pr-[3.5rem]' : 'pr-4'
        } text-[0.9375rem] text-ink placeholder:text-muted shadow-[0_1px_2px_0_rgb(17_24_39_/_0.04)] transition-[border-color,box-shadow] duration-200 hover:border-muted focus:border-brand-500 focus-visible:ring-offset-surface aria-[invalid=true]:border-red-400 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted ${className}`}
        {...rest}
      />

      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 h-[1.0625rem] w-[1.0625rem] -translate-y-1/2 text-muted transition-colors duration-200 peer-focus:text-brand-600 peer-disabled:text-line-strong"
      />

      {trailing}
    </div>
  </div>
);

export default AuthField;
