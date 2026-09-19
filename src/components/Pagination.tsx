import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Offset pagination.
 *
 * Offset rather than keyset because results are sorted by user-chosen keys
 * (price, rating, relevance) with a stable id tiebreaker, and the catalogue is
 * small enough that deep-offset cost is irrelevant. Keyset becomes worth it
 * when result sets reach tens of thousands of rows.
 */
const Pagination = ({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) => {
  if (totalCount === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);

  return (
    <nav
      className="mt-10 flex flex-col items-center justify-between gap-4 sm:flex-row"
      aria-label="Search results pages"
    >
      <p className="text-sm text-muted" aria-live="polite">
        Showing <span className="font-medium text-ink">{first}</span>–
        <span className="font-medium text-ink">{last}</span> of{' '}
        <span className="font-medium text-ink">{totalCount}</span> vendors
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-10 items-center gap-1 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink-soft transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </button>

        <span className="px-2 text-sm text-muted">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-10 items-center gap-1 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink-soft transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};

export default Pagination;
