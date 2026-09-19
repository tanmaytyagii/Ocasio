import type { ReactNode } from 'react';
import { AlertCircle, Info, SearchX } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

/**
 * Loading, empty, error and notice states.
 *
 * Consolidated from AsyncStates so every async surface in the product reports
 * the same way. The rule this enforces: a failed request must never render as
 * an empty one.
 */

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-line ${className}`} aria-hidden="true" />
);

/** Card skeletons matching VendorCard geometry, to avoid layout shift. */
export const VendorGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} className="overflow-hidden">
        <Skeleton className="h-48 rounded-none" />
        <div className="space-y-3 p-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    ))}
  </div>
);

export const ListSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-4" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} className="p-6">
        <Skeleton className="mb-3 h-5 w-1/3" />
        <Skeleton className="mb-2 h-4 w-1/4" />
        <Skeleton className="h-4 w-1/2" />
      </Card>
    ))}
  </div>
);

export const ErrorState = ({
  message,
  onRetry,
  className = '',
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) => (
  <div
    role="alert"
    className={`rounded-card border border-red-200 bg-red-50 p-6 ${className}`}
  >
    <div className="flex gap-3">
      <AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
      <div>
        <p className="font-medium text-red-900">Something went wrong</p>
        <p className="mt-1 text-sm text-red-800">{message}</p>
        {onRetry && (
          <Button variant="danger" size="sm" onClick={onRetry} className="mt-4">
            Try again
          </Button>
        )}
      </div>
    </div>
  </div>
);

export const EmptyState = ({
  title,
  description,
  action,
  icon: Icon = SearchX,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: typeof SearchX;
}) => (
  <div className="rounded-card border border-dashed border-line-strong bg-surface py-16 text-center">
    <Icon className="mx-auto mb-4 h-10 w-10 text-muted" aria-hidden="true" />
    <h3 className="text-lg font-semibold text-ink">{title}</h3>
    <p className="mx-auto mt-2 max-w-md px-4 text-muted">{description}</p>
    {action && <div className="mt-6">{action}</div>}
  </div>
);

/**
 * An honest notice. Used wherever Ocasio has to say "this part is not real
 * yet" — demo ratings, the checkout placeholder, unbuilt messaging.
 */
export const Notice = ({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning';
  title?: string;
  children: ReactNode;
}) => {
  const styles =
    tone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-blue-200 bg-blue-50 text-blue-900';
  const iconColor = tone === 'warning' ? 'text-amber-600' : 'text-blue-600';
  const Icon = tone === 'warning' ? AlertCircle : Info;

  return (
    <div role="note" className={`flex gap-3 rounded-card border p-4 ${styles}`}>
      <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} aria-hidden="true" />
      <div className="text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-1' : ''}>{children}</div>
      </div>
    </div>
  );
};
