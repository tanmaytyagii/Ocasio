import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * The facet control the marketplace toolbar is built from: a trigger that
 * states its own value, and a panel that opens from it.
 *
 * Written by hand rather than pulled from a library because the product has no
 * popover dependency and a toolbar does not justify adding one. What it has to
 * get right is the keyboard contract, so that is what it implements:
 *
 *   - Escape closes and returns focus to the trigger
 *   - a pointer outside closes, without yanking focus back
 *   - opening moves focus into the panel
 *   - Tab is not trapped
 *
 * Every panel is a bottom sheet below sm and an anchored popover above it —
 * one component and one piece of state, not two. A panel anchored to a 44px
 * trigger is unusable on a phone, and a separate mobile component would be a
 * separate set of bugs.
 */
interface Props {
  /** The facet name, e.g. "Category". Also the panel's accessible name. */
  label: string;
  /** What is currently chosen. Shown on the trigger in place of the label. */
  summary: string;
  active: boolean;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  /**
   * A complete, static `sm:` width class. Passed whole rather than composed,
   * because Tailwind scans source text — a class assembled at runtime is never
   * generated, and the panel silently loses its width.
   */
  panelWidth?: string;
  icon?: ReactNode;
}

const FilterPopover = ({
  label,
  summary,
  active,
  children,
  align = 'start',
  panelWidth = 'sm:w-72',
  icon,
}: Props) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(
        'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={`inline-flex h-11 max-w-[14rem] items-center gap-2 whitespace-nowrap rounded-control border px-3.5 text-sm transition-colors duration-200 ${
          active
            ? 'border-brand-300 bg-brand-50 font-medium text-brand-800'
            : 'border-line-strong bg-surface text-ink-soft hover:bg-canvas'
        }`}
      >
        {icon}
        <span className="truncate">{active ? summary : label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 animate-fade-in bg-ink/40 sm:hidden"
          />

          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            className={`fixed inset-x-0 bottom-0 z-50 max-h-[85vh] animate-rise-in overflow-y-auto rounded-t-[1.25rem] border border-line bg-surface p-5 shadow-overlay sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-[calc(100%+0.5rem)] sm:max-h-none sm:rounded-card sm:p-4 ${
              align === 'end' ? 'sm:right-0' : 'sm:left-0'
            } ${panelWidth}`}
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong sm:hidden"
            />
            <p className="mb-3 text-sm font-semibold text-ink sm:hidden">{label}</p>
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
};

export default FilterPopover;
