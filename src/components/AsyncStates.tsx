import type { ReactNode } from 'react';
import { AlertCircle, SearchX } from 'lucide-react';

/**
 * Loading / error / empty states.
 *
 * Every list in Ocasio previously rendered synchronously from a local array and
 * so had none of these. Now that data comes over the network, each is required.
 */

/** Card skeletons matching VendorCard's geometry, to avoid layout shift. */
export const VendorGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="overflow-hidden rounded-lg bg-white shadow-md">
        <div className="h-48 animate-pulse bg-gray-200" />
        <div className="space-y-3 p-6">
          <div className="h-5 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    ))}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-6" role="alert">
    <div className="flex gap-3">
      <AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
      <div>
        <p className="font-medium text-red-900">Something went wrong</p>
        <p className="mt-1 text-sm text-red-800">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  </div>
);

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
    <SearchX className="mx-auto mb-4 h-10 w-10 text-gray-400" aria-hidden="true" />
    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    <p className="mx-auto mt-2 max-w-md px-4 text-gray-600">{description}</p>
    {action && <div className="mt-6">{action}</div>}
  </div>
);
