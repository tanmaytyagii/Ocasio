import type { BookingStatus } from '../types/database';

/**
 * Status pill.
 *
 * The wording is deliberately precise: "Pending vendor response" rather than
 * "Pending", and "Accepted" never says confirmed or paid, because no payment
 * exists.
 */
const STYLES: Record<BookingStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending vendor response',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  accepted: {
    label: 'Accepted by vendor',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  declined: {
    label: 'Declined by vendor',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-canvas text-ink-soft border-line',
  },
  completed: {
    label: 'Completed',
    className: 'bg-brand-100 text-purple-800 border-purple-200',
  },
};

const BookingStatusBadge = ({
  status,
  className = '',
}: {
  status: BookingStatus;
  className?: string;
}) => {
  const style = STYLES[status];
  return (
    <span
      data-testid="booking-status"
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${style.className} ${className}`}
    >
      {style.label}
    </span>
  );
};

export default BookingStatusBadge;
