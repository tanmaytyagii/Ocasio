import { useId } from 'react';
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/**
 * Form primitives.
 *
 * Every control gets a real <label> tied by id — previously some inputs had
 * labels, some had aria-label, and a few had neither. `hint` and `error` are
 * wired through aria-describedby so assistive tech reads them with the field.
 */
const CONTROL =
  'w-full rounded-control border border-line-strong bg-surface px-3 text-ink placeholder:text-muted ' +
  'transition-colors focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-canvas';

const FIELD_HEIGHT = 'h-11';

function useFieldIds(explicit?: string) {
  const generated = useId();
  const id = explicit ?? generated;
  return { id, hintId: `${id}-hint`, errorId: `${id}-error` };
}

const Shell = ({
  id,
  label,
  hint,
  error,
  optional,
  hintId,
  errorId,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  hintId: string;
  errorId: string;
  children: ReactNode;
}) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
      {label}
      {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
    </label>
    {children}
    {hint && !error && (
      <p id={hintId} className="mt-1.5 text-xs text-muted">
        {hint}
      </p>
    )}
    {error && (
      <p id={errorId} className="mt-1.5 text-xs text-red-700">
        {error}
      </p>
    )}
  </div>
);

export const TextField = ({
  label,
  hint,
  error,
  optional,
  id: explicitId,
  className = '',
  ...rest
}: { label: string; hint?: string; error?: string; optional?: boolean } & InputHTMLAttributes<HTMLInputElement>) => {
  const { id, hintId, errorId } = useFieldIds(explicitId);
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} hintId={hintId} errorId={errorId}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${CONTROL} ${FIELD_HEIGHT} ${error ? 'border-red-400' : ''} ${className}`}
        {...rest}
      />
    </Shell>
  );
};

export const SelectField = ({
  label,
  hint,
  error,
  optional,
  id: explicitId,
  className = '',
  children,
  ...rest
}: { label: string; hint?: string; error?: string; optional?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) => {
  const { id, hintId, errorId } = useFieldIds(explicitId);
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} hintId={hintId} errorId={errorId}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${CONTROL} ${FIELD_HEIGHT} ${error ? 'border-red-400' : ''} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
};

export const TextAreaField = ({
  label,
  hint,
  error,
  optional,
  id: explicitId,
  className = '',
  ...rest
}: { label: string; hint?: string; error?: string; optional?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const { id, hintId, errorId } = useFieldIds(explicitId);
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} hintId={hintId} errorId={errorId}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${CONTROL} py-2.5 ${error ? 'border-red-400' : ''} ${className}`}
        {...rest}
      />
    </Shell>
  );
};
