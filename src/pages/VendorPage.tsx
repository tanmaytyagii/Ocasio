import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Star, MapPin, Phone, Mail, Globe, Clock, Send, CalendarCheck, Info } from 'lucide-react';
import { getVendorBySlug } from '../services/vendors';
import { useAsync } from '../hooks/useAsync';
import { usePageMeta } from '../hooks/usePageMeta';
import FavoriteButton from '../components/FavoriteButton';
import BookingRequestForm from '../components/BookingRequestForm';
import { ErrorState } from '../components/ui';
import VendorReviews from '../components/VendorReviews';
import NotFound from './NotFound';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'vendor';
  timestamp: Date;
}

const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Marks a surface that does not persist yet, so nothing is mistaken for real. */
const DemoNotice = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-4" role="note">
    <Info className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
    <p className="text-sm text-amber-900">{children}</p>
  </div>
);

const VendorPage = () => {
  const { slug = '' } = useParams();

  const { data: vendor, loading, error, retry } = useAsync(() => getVendorBySlug(slug), [slug]);

  const [showContact, setShowContact] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [submittedBookingId, setSubmittedBookingId] = useState<string | null>(null);

  usePageMeta(
    vendor ? `${vendor.business_name} — ${vendor.category} in ${vendor.location} — Ocasio` : 'Vendor — Ocasio',
    vendor?.description ?? undefined,
  );

  if (loading) {
    return (
      <div className="bg-canvas">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="h-96 animate-pulse bg-line" />
            <div className="space-y-4 p-8">
              <div className="h-8 w-1/3 animate-pulse rounded bg-line" />
              <div className="h-4 w-1/4 animate-pulse rounded bg-line" />
              <div className="h-24 w-full animate-pulse rounded bg-line" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <ErrorState message={error} onRetry={retry} />
      </div>
    );
  }

  if (!vendor) return <NotFound />;

  const bookableServices = vendor.vendor_services.filter((s) => s.is_active).length;

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: message, sender: 'user', timestamp: new Date() },
    ]);
    setMessage('');
  };

  if (submittedBookingId) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-card border border-line bg-surface p-8 text-center shadow-card">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CalendarCheck className="h-8 w-8 text-green-600" aria-hidden="true" />
            </div>
            <h2 className="mb-4 text-2xl font-bold text-ink">Booking request submitted</h2>
            <p className="mb-6 text-muted">
              Your request has been sent to {vendor.business_name}. It is now awaiting their
              response — this is not a confirmed booking, and no payment has been taken. You can
              track its status and cancel it from your bookings.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to={`/bookings/${submittedBookingId}`}
                className="inline-flex h-12 items-center justify-center rounded-control bg-brand-600 px-6 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-700"
              >
                View this request
              </Link>
              <Link
                to="/bookings"
                className="inline-flex h-12 items-center justify-center rounded-control border border-line-strong bg-surface px-6 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas"
              >
                All my bookings
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="relative h-96 bg-canvas">
            {/* An empty src issues a request for the page itself and renders the
                broken-image glyph, so a vendor with no hero yet gets a plain
                surface instead. */}
            {vendor.hero_image_url ? (
              <img
                src={vendor.hero_image_url}
                alt={`${vendor.business_name} cover image`}
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
                <span className="text-sm text-muted">No cover image yet</span>
              </div>
            )}
            <FavoriteButton
              vendorId={vendor.id}
              vendorName={vendor.business_name}
              className="absolute right-4 top-4"
            />
          </div>

          <div className="p-8">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-ink">{vendor.business_name}</h1>
                <p className="mt-2 text-muted">{vendor.category}</p>
              </div>
              <div className="text-right">
                {vendor.review_count > 0 || !vendor.rating_is_demo ? (
                  <>
                    <div className="flex items-center justify-end">
                      <Star className="h-6 w-6 fill-current text-amber-400" aria-hidden="true" />
                      <span className="ml-2 text-2xl font-bold text-ink">
                        {vendor.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-muted">
                      {vendor.review_count} review{vendor.review_count === 1 ? '' : 's'}
                    </p>
                  </>
                ) : (
                  /* A seeded rating with no reviews behind it. Saying so is the
                     whole point of rating_is_demo; showing the number large and
                     unqualified is what made it look earned. */
                  <p className="max-w-[12rem] text-sm text-muted">
                    Sample rating — no customer reviews yet
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <h2 className="mb-4 text-xl font-semibold">About us</h2>
                <p className="text-muted">{vendor.description}</p>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center">
                    <MapPin className="h-5 w-5 text-muted" aria-hidden="true" />
                    <span className="ml-2 text-muted">{vendor.location}</span>
                  </div>
                  {/* These were inert spans. Messaging is not built, so the
                      phone number and the email address are the only real ways
                      to reach this vendor — they should be one tap. */}
                  {vendor.phone && (
                    <div className="flex items-center">
                      <Phone className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                      <a
                        href={`tel:${vendor.phone.replace(/[^+\d]/g, '')}`}
                        className="ml-2 text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline"
                      >
                        {vendor.phone}
                      </a>
                    </div>
                  )}
                  {vendor.email && (
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                      <a
                        href={`mailto:${vendor.email}`}
                        className="ml-2 truncate text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline"
                      >
                        {vendor.email}
                      </a>
                    </div>
                  )}
                  {vendor.website && (
                    <div className="flex items-center">
                      <Globe className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                      <a
                        href={/^https?:\/\//i.test(vendor.website) ? vendor.website : `https://${vendor.website}`}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="ml-2 truncate text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline"
                      >
                        {vendor.website}
                      </a>
                    </div>
                  )}
                  {vendor.business_hours && (
                    <div className="flex items-center">
                      <Clock className="h-5 w-5 text-muted" aria-hidden="true" />
                      <span className="ml-2 text-muted">{vendor.business_hours}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h2 className="mb-4 text-xl font-semibold">Services</h2>
                {vendor.vendor_services.length === 0 ? (
                  <p className="text-muted">
                    This vendor has not listed any services yet, so there is nothing to book
                    against. You can still contact them directly.
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {vendor.vendor_services.map((service) => (
                      <li key={service.id} className="flex items-start justify-between gap-4 p-3">
                        <div>
                          <p className="font-medium text-ink">{service.name}</p>
                          {service.description && (
                            <p className="mt-0.5 text-sm text-muted">{service.description}</p>
                          )}
                        </div>
                        {service.price !== null && (
                          <p className="whitespace-nowrap text-sm font-semibold text-ink">
                            {formatRupees(service.price)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {vendor.starting_price !== null && (
                  <div className="mt-8">
                    <h2 className="mb-4 text-xl font-semibold">Pricing</h2>
                    <p className="text-muted">
                      Starting from {formatRupees(vendor.starting_price)} onwards
                    </p>
                  </div>
                )}

                {/* Requesting a booking is the real action and is now the
                    primary control. The message panel below it does not persist
                    anything yet, and it had the purple button. */}
                <div className="mt-8 space-y-3">
                  <button
                    onClick={() => setShowBooking(true)}
                    className="flex h-12 w-full items-center justify-center rounded-control bg-brand-600 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-700"
                  >
                    Request a booking
                  </button>
                  <button
                    onClick={() => setShowContact(true)}
                    className="flex h-12 w-full items-center justify-center rounded-control border border-line-strong bg-surface text-sm font-medium text-ink-soft transition-colors hover:bg-canvas"
                  >
                    Send a message
                  </button>
                  {bookableServices === 0 && (
                    <p className="text-sm text-muted">
                      This vendor has not listed a bookable service yet. Their phone number and
                      email are above.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <VendorReviews
              vendorId={vendor.id}
              rating={vendor.rating}
              reviewCount={vendor.review_count}
              ratingIsDemo={vendor.rating_is_demo}
            />

            {vendor.vendor_media.length > 0 && (
              <div className="mt-10 border-t pt-8">
                <h2 className="mb-2 text-xl font-semibold">Portfolio</h2>
                {/* Seeded listings carry stock imagery; a real vendor uploads
                    their own. rating_is_demo is what distinguishes them, so the
                    caption follows it instead of labelling everything a demo. */}
                {vendor.rating_is_demo && (
                  <p className="mb-4 text-sm text-muted">
                    Sample imagery supplied with this demo listing, not verified client work.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {vendor.vendor_media.map((media) => (
                    <img
                      key={media.id}
                      src={media.url}
                      alt={media.alt_text ?? `${vendor.business_name} portfolio image`}
                      loading="lazy"
                      decoding="async"
                      width={320}
                      height={160}
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {showContact && (
          <div className="mt-8 rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-xl font-semibold">Message {vendor.business_name}</h2>
            <DemoNotice>
              Messaging is not connected yet — nothing you type here is sent or saved. Persistent
              conversations arrive with the messaging system.
            </DemoNotice>

            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className={m.sender === 'user' ? 'text-right' : 'text-left'}>
                  <div
                    className={`inline-block rounded-lg p-3 ${
                      m.sender === 'user' ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-soft'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="mt-4 flex gap-4">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message…"
                aria-label="Message"
                className="flex-1 rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 text-white hover:bg-brand-700"
                aria-label="Send message"
              >
                <Send className="h-5 w-5" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}

        {showBooking && (
          <div className="mt-8 rounded-lg bg-white p-6 shadow-lg" id="booking">
            <h2 className="mb-4 text-xl font-semibold">Request a booking</h2>
            <BookingRequestForm
              vendor={vendor}
              onSubmitted={(id) => setSubmittedBookingId(id)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorPage;
