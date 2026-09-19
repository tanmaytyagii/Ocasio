import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquareQuote } from 'lucide-react';
import { canReview, createReview, getReviewForBooking } from '../services/reviews';
import StarRating from './StarRating';
import type { BookingWithDetails, Review } from '../types/database';

/**
 * Review section of a booking.
 *
 * Offers the form only when the booking is completed, the viewer is the
 * customer, and no review exists yet. Once written, a review is immutable —
 * there is no edit control because there is no policy that would allow one.
 *
 * Both parties see a submitted review; only the customer ever sees the form.
 */
const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const BookingReviewPanel = ({
  booking,
  isCustomer,
}: {
  booking: BookingWithDetails;
  isCustomer: boolean;
}) => {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReview(await getReviewForBooking(booking.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the review.');
    } finally {
      setLoading(false);
    }
  }, [booking.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (rating < 1) {
      setError('Choose a rating from 1 to 5 stars.');
      return;
    }

    setSubmitting(true);
    try {
      await createReview(booking.id, rating, body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  };

  // Nothing to show: not completed, and no review to display.
  if (booking.status !== 'completed' && !review) return null;

  if (loading) {
    return (
      <section className="mt-6 rounded-card border border-line bg-surface p-6 sm:p-8">
        <div className="mb-4 h-6 w-1/4 animate-pulse rounded bg-line" aria-hidden="true" />
        <div className="h-12 w-full animate-pulse rounded bg-line" aria-hidden="true" />
      </section>
    );
  }

  const showForm = canReview(booking.status, isCustomer, review);

  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-6 sm:p-8">
      <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-ink">
        <MessageSquareQuote className="h-5 w-5 text-brand-700" aria-hidden="true" />
        Review
      </h2>

      {error && (
        <div className="mb-4 rounded-control border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {review && (
        <div data-testid="booking-review">
          <div className="flex items-center gap-3">
            <StarRating value={review.rating} />
            <span className="text-sm text-muted">{formatTimestamp(review.created_at)}</span>
          </div>
          {review.body && (
            <p className="mt-3 whitespace-pre-line text-ink-soft">{review.body}</p>
          )}
          <p className="mt-4 text-xs text-muted">
            Reviews cannot be edited or removed once submitted.
          </p>
        </div>
      )}

      {!review && !showForm && (
        <p className="text-muted">
          {isCustomer
            ? 'You can leave a review once this booking is completed.'
            : 'This booking has not been reviewed.'}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-muted">
            How did {booking.vendors?.business_name ?? 'this vendor'} do? Your review is public and
            cannot be changed afterwards.
          </p>

          <div>
            <span className="mb-2 block text-sm font-medium text-ink-soft">Rating</span>
            <StarRating value={rating} onChange={setRating} label="Rating out of 5" />
          </div>

          <div>
            <label htmlFor="review-body" className="mb-2 block text-sm font-medium text-ink-soft">
              Your review <span className="text-muted">(optional)</span>
            </label>
            <textarea
              id="review-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What went well, what could have been better…"
              className="w-full rounded-lg border border-line-strong p-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center gap-2 rounded-control bg-brand-600 px-5 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
        </form>
      )}
    </section>
  );
};

export default BookingReviewPanel;
