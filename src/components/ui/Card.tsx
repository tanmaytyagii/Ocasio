import type { ReactNode } from 'react';

/**
 * Surface primitive. One radius, one border, one shadow — the three things
 * that were drifting most between pages.
 */
export const Card = ({
  children,
  className = '',
  interactive = false,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Adds hover elevation. Use only when the whole card is a link or button. */
  interactive?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) => (
  <Tag
    className={`rounded-card border border-line bg-surface shadow-card ${
      interactive ? 'transition-shadow hover:shadow-card-hover' : ''
    } ${className}`}
  >
    {children}
  </Tag>
);

/** Standard padded panel with an optional heading. */
export const Panel = ({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <Card as="section" className={`p-6 sm:p-8 ${className}`}>
    {(title || action) && (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </Card>
);
