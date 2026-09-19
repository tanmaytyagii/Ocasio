import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import {
  getBookingById,
  getBookingHistory,
  cancelBooking,
  canCustomerCancel,
} from '../services/bookings';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import BookingStatusBadge from '../components/BookingStatusBadge';
import { ErrorState } from '../components/AsyncStates';
import NotFound from './NotFound';
import type { BookingStatusHistoryEntry, BookingWithDetails } from '../types/database';

/**
 * A single booking.
 *
 * Readable by the customer and by the vendor owner — RLS decides which, so a
 * booking belonging to anyone else simply comes back null and renders
 * not-found. There is no separate permission check here to fall out of step
 * with the database.
 */
const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const HISTORY_LABEL: Record<string, string> = {
  pending: 'Request submitted',
  accepted: 'Accepted by vendor',
  declined: 'Declined by vendor',
  cancelled: 'Cancelled',
  completed: 'Marked completed',
};

const BookingDetail = () => {
  const { id = '' } = useParams();
  const { user } = useAuth();

  const [booking, setBooking] = useState<BookingWithDetails | null>(null);
  const [history, setHistory] = useState<BookingStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  usePageMeta(booking ? `Booking — ${booking.vendors?.business_name ?? 'Ocasio'}` : 'Booking — Ocasio');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const found = await getBookingById(id);
      setBooking(found);
      if (found) setHistory(await getBookingHistory(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this booking.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async () => {
    if (cancelling || !booking) return;
    setActionError(null);
    setCancelling(true);
    try {
      await cancelBooking(booking.id);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not cancel this booking.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <div className="mb-4 h-7 w-1/3 animate-pulse rounded bg-gray-200" />
            <div className="mb-2 h-4 w-1/4 animate-pulse rounded bg-gray-200" />
            <div className="h-24 w-full animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-24">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  // Null covers both "no such booking" and "not yours" — the database does not
  // distinguish, and neither should the UI.
  if (!booking) return <NotFound />;

  const isCustomer = user?.id === booking.customer_id;
  const showCancel = isCustomer && canCustomerCancel(booking.status);

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to={isCustomer ? '/bookings' : '/vendor/dashboard'}
          className="mb-6 inline-flex items-center text-sm text-purple-600 hover:underline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          {isCustomer ? 'Back to my bookings' : 'Back to dashboard'}
        </Link>

        <div className="rounded-lg bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {booking.vendors?.slug ? (
                  <Link to={`/vendors/${booking.vendors.slug}`} className="hover:underline">
                    {booking.vendors.business_name}
                  </Link>
                ) : (
                  (booking.vendors?.business_name ?? 'Vendor')
                )}
              </h1>
              <p className="mt-1 text-gray-600">{booking.vendor_services?.name}</p>
            </div>
            <BookingStatusBadge status={booking.status} />
          </div>

          <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-500">Event date</dt>
              <dd className="mt-1 font-medium text-gray-900">{formatDate(booking.event_date)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Location</dt>
              <dd className="mt-1 flex items-center font-medium text-gray-900">
                <MapPin className="mr-1 h-4 w-4 text-gray-400" aria-hidden="true" />
                {booking.event_location}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Indicative quote</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {formatRupees(booking.quoted_price)}
              </dd>
              <p className="mt-1 text-xs text-gray-500">
                A starting figure, not an invoice. No payment has been taken.
              </p>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Requested</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {formatTimestamp(booking.created_at)}
              </dd>
            </div>
          </dl>

          {booking.customer_notes && (
            <div className="mt-6 border-t pt-6">
              <h2 className="text-sm font-medium text-gray-500">Notes</h2>
              <p className="mt-1 whitespace-pre-line text-gray-800">{booking.customer_notes}</p>
            </div>
          )}

          {showCancel && (
            <div className="mt-8 border-t pt-6">
              {actionError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
                  <p className="text-sm text-red-800">{actionError}</p>
                </div>
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-5 py-2.5 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {cancelling ? 'Cancelling…' : 'Cancel this booking'}
              </button>
            </div>
          )}
        </div>

        <section className="mt-8 rounded-lg bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-gray-900">Status history</h2>
          <ol className="space-y-5">
            {history.map((entry) => (
              <li key={entry.id} className="flex gap-4">
                <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-purple-600" aria-hidden="true" />
                <div>
                  <p className="font-medium text-gray-900">
                    {HISTORY_LABEL[entry.to_status] ?? entry.to_status}
                  </p>
                  <p className="text-sm text-gray-500">{formatTimestamp(entry.created_at)}</p>
                  {entry.note && <p className="mt-1 text-sm text-gray-700">“{entry.note}”</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
};

export default BookingDetail;
