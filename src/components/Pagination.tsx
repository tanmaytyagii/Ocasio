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
      <p className="text-sm text-gray-600" aria-live="polite">
        Showing <span className="font-medium text-gray-900">{first}</span>–
        <span className="font-medium text-gray-900">{last}</span> of{' '}
        <span className="font-medium text-gray-900">{totalCount}</span> vendors
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </button>

        <span className="px-2 text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};

export default Pagination;
