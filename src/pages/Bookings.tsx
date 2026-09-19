import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { getCustomerBookings } from '../services/bookings';
import { usePageMeta } from '../hooks/usePageMeta';
import BookingStatusBadge from '../components/BookingStatusBadge';
import { ErrorState, EmptyState } from '../components/ui';
import type { BookingWithDetails } from '../types/database';

/**
 * The customer's bookings.
 *
 * RLS scopes the query to the signed-in user, so there is no client-side
 * filter by customer id that could drift from what the database enforces.
 */
const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const ListSkeleton = () => (
  <div className="space-y-4" aria-hidden="true">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-card border border-line bg-surface p-6">
        <div className="mb-3 h-5 w-1/3 animate-pulse rounded bg-line" />
        <div className="mb-2 h-4 w-1/4 animate-pulse rounded bg-line" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-line" />
      </div>
    ))}
  </div>
);

const Bookings = () => {
  usePageMeta('My bookings — Ocasio');

  const [bookings, setBookings] = useState<BookingWithDetails[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await getCustomerBookings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-2 flex items-center gap-2 text-4xl font-bold text-ink">
          <CalendarDays className="h-8 w-8 text-brand-700" aria-hidden="true" />
          My bookings
        </h1>
        <p className="mb-8 text-muted" aria-live="polite">
          {loading ? 'Loading…' : `${bookings?.length ?? 0} booking request${bookings?.length === 1 ? '' : 's'}`}
        </p>

        {loading && <ListSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && bookings?.length === 0 && (
          <EmptyState
            title="No booking requests yet"
            description="When you request a booking from a vendor, it will appear here so you can track its status."
            action={
              <Link
                to="/vendors"
                className="inline-flex h-11 items-center justify-center rounded-control bg-brand-600 px-5 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-700"
              >
                Browse vendors
              </Link>
            }
          />
        )}

        {!loading && !error && bookings && bookings.length > 0 && (
          <ul className="space-y-4">
            {bookings.map((booking) => (
              <li key={booking.id}>
                <Link
                  to={`/bookings/${booking.id}`}
                  className="block rounded-card border border-line bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-ink">
                        {booking.vendors?.business_name ?? 'Vendor'}
                      </h2>
                      <p className="text-muted">{booking.vendor_services?.name}</p>
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
                      <dt className="text-muted">Indicative quote</dt>
                      <dd className="font-medium text-ink">
                        {formatRupees(booking.quoted_price)}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Bookings;
