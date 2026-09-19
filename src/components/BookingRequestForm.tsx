import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarCheck, Info, Loader2 } from 'lucide-react';
import { createBooking } from '../services/bookings';
import { useAuth } from '../contexts/AuthContext';
import type { VendorService, VendorWithDetails } from '../types/database';

/**
 * Booking request form.
 *
 * Submits intent only. The price shown is computed the same way the database
 * computes it, but it is display text — `create_booking` derives the stored
 * quoted_price itself and ignores anything the browser might send.
 *
 * There is no payment step. A booking request is not a purchase, and nothing
 * here should suggest otherwise.
 */
const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Mirrors create_booking(): service price first, then vendor starting price. */
function quoteFor(service: VendorService | undefined, vendorStartingPrice: number | null) {
  return service?.price ?? vendorStartingPrice ?? null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const BookingRequestForm = ({
  vendor,
  onSubmitted,
}: {
  vendor: VendorWithDetails;
  onSubmitted: (bookingId: string) => void;
}) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const bookableServices = useMemo(
    () => vendor.vendor_services.filter((s) => s.is_active),
    [vendor.vendor_services],
  );

  const [serviceId, setServiceId] = useState(bookableServices[0]?.id ?? '');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState(vendor.location);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = bookableServices.find((s) => s.id === serviceId);
  const quote = quoteFor(selected, vendor.starting_price);

  const goToSignIn = () => {
    navigate('/auth', { state: { from: location }, replace: false });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guards against a double click or a resubmitted form; the database also
    // rejects a duplicate live request for the same service and date.
    if (submitting) return;

    setError(null);

    if (!user) {
      goToSignIn();
      return;
    }

    setSubmitting(true);
    try {
      const booking = await createBooking({
        vendorServiceId: serviceId,
        eventDate,
        eventLocation,
        customerNotes: notes,
      });
      onSubmitted(booking.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your booking request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (bookableServices.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-canvas p-6 text-center">
        <p className="text-ink-soft">
          {vendor.business_name} is not accepting online booking requests at the moment.
        </p>
      </div>
    );
  }

  const field =
    'w-full rounded-lg border border-line-strong p-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600';
  const labelStyle = 'mb-2 block text-sm font-medium text-ink-soft';

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate={false}>
      <div className="flex gap-3 rounded-card border border-blue-200 bg-blue-50 p-4" role="note">
        <Info className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
        <p className="text-sm text-blue-900">
          This sends a request to {vendor.business_name}. It is not a confirmed booking and no
          payment is taken. They will accept or decline it, and you can track the status from your
          bookings.
        </p>
      </div>

      <div>
        <label htmlFor="booking-service" className={labelStyle}>
          Service
        </label>
        <select
          id="booking-service"
          required
          className={field}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          {bookableServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.price !== null ? ` — ${formatRupees(s.price)}` : ''}
            </option>
          ))}
        </select>
        {selected?.description && (
          <p className="mt-1 text-sm text-muted">{selected.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="booking-date" className={labelStyle}>
            Event date
          </label>
          <input
            id="booking-date"
            type="date"
            required
            min={today()}
            className={field}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="booking-location" className={labelStyle}>
            Event location
          </label>
          <input
            id="booking-location"
            type="text"
            required
            maxLength={200}
            className={field}
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="booking-notes" className={labelStyle}>
          Anything the vendor should know <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="booking-notes"
          rows={3}
          maxLength={2000}
          placeholder="Guest count, timings, specific requirements…"
          className={field}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="rounded-lg bg-canvas p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Indicative quote</p>
            <p className="mt-0.5 text-xs text-muted">
              {selected?.price !== null && selected?.price !== undefined
                ? 'Based on this service’s listed price.'
                : 'Based on this vendor’s starting price — this service has no separate price yet.'}
            </p>
          </div>
          <p className="text-xl font-semibold text-ink" data-testid="booking-quote">
            {quote === null ? 'On request' : formatRupees(quote)}
          </p>
        </div>
        <p className="mt-3 border-t pt-3 text-xs text-muted">
          Calculated by Ocasio when the request is created. It is a starting figure, not a final
          invoice, and no payment is collected at this stage.
        </p>
      </div>

      {error && (
        <div className="rounded-control border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Signed out, this is a plain button rather than a submit: the form's
          required fields would otherwise block submission and the visitor
          would never reach the sign-in redirect. While the session is still
          resolving the label stays neutral, so a signed-in user never sees a
          flash of "sign in". */}
      <button
        type={user ? 'submit' : 'button'}
        onClick={user ? undefined : goToSignIn}
        disabled={submitting || authLoading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-brand-600 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Sending request…
          </>
        ) : (
          <>
            <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            {authLoading ? 'Checking your session…' : user ? 'Send booking request' : 'Sign in to request a booking'}
          </>
        )}
      </button>
    </form>
  );
};

export default BookingRequestForm;
