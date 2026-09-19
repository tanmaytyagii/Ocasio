import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MapPin } from 'lucide-react';
import {
  getVendorBookings,
  transitionBookingStatus,
  vendorActionsFor,
} from '../services/bookings';
import BookingStatusBadge from './BookingStatusBadge';
import { ErrorState, EmptyState } from './ui';
import type { BookingStatus, BookingWithDetails } from '../types/database';

/**
 * Booking requests for the vendors the signed-in user owns.
 *
 * RLS scopes the query, so this cannot show another vendor's bookings even if
 * the component asked for them. Every action calls
 * transition_booking_status(); nothing updates a row from React.
 *
 * The action buttons come from vendorActionsFor(), which mirrors the database
 * lifecycle. That is presentation only — the server re-validates, so a
 * hand-crafted request gets the same answer as a hidden button.
 */
const ACTION_LABEL: Partial<Record<BookingStatus, string>> = {
  accepted: 'Accept',
  declined: 'Decline',
  completed: 'Mark completed',
  cancelled: 'Cancel',
};

const ACTION_STYLE: Partial<Record<BookingStatus, string>> = {
  accepted: 'bg-brand-600 text-white shadow-card hover:bg-brand-700',
  declined: 'border border-line-strong bg-surface text-ink-soft hover:bg-canvas',
  completed: 'bg-brand-600 text-white shadow-card hover:bg-brand-700',
  cancelled: 'border border-red-300 bg-surface text-red-700 hover:bg-red-50',
};

const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const VendorBookingRequests = () => {
  const [bookings, setBookings] = useState<BookingWithDetails[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await getVendorBookings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load booking requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (bookingId: string, next: BookingStatus) => {
    if (pendingId) return;
    setActionError(null);
    setPendingId(bookingId);
    try {
      await transitionBookingStatus(bookingId, next);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update this booking.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div>
      <h3 className="mb-6 text-2xl font-bold">Booking requests</h3>

      {actionError && (
        <div className="mb-4 rounded-control border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm text-red-800">{actionError}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-4" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-6">
              <div className="mb-3 h-5 w-1/3 animate-pulse rounded bg-line" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-line" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && bookings?.length === 0 && (
        <EmptyState
          title="No booking requests yet"
          description="When a customer requests one of your services, it will appear here for you to accept or decline."
        />
      )}

      {!loading && !error && bookings && bookings.length > 0 && (
        <ul className="space-y-4">
          {bookings.map((booking) => {
            const actions = vendorActionsFor(booking.status);
            const busy = pendingId === booking.id;

            return (
              <li key={booking.id} className="rounded-card border border-line bg-surface p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-ink">
                      {booking.vendor_services?.name}
                    </h4>
                    <p className="text-sm text-muted">
                      Requested {formatDate(booking.created_at.slice(0, 10))}
                    </p>
                  </div>
                  <BookingStatusBadge status={booking.status} />
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">Event date</dt>
                    <dd className="font-medium text-ink">{formatDate(booking.event_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Location</dt>
                    <dd className="flex items-center font-medium text-ink">
                      <MapPin className="mr-1 h-4 w-4 text-muted" aria-hidden="true" />
                      {booking.event_location}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Quote</dt>
                    <dd className="font-medium text-ink">
                      {formatRupees(booking.quoted_price)}
                    </dd>
                  </div>
                </dl>

                {booking.customer_notes && (
                  <div className="mt-4 rounded-lg bg-canvas p-3">
                    <p className="text-xs font-medium text-muted">Customer notes</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">
                      {booking.customer_notes}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
                  {actions.map((next) => (
                    <button
                      key={next}
                      type="button"
                      onClick={() => act(booking.id, next)}
                      disabled={busy}
                      className={`inline-flex h-10 items-center gap-2 rounded-control px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${ACTION_STYLE[next]}`}
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {ACTION_LABEL[next]}
                    </button>
                  ))}

                  <Link
                    to={`/bookings/${booking.id}`}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    View details and history
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default VendorBookingRequests;
