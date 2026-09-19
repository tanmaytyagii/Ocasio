import { useCallback, useEffect, useState } from 'react';
import { listVendorReviews } from '../services/reviews';
import StarRating from './StarRating';
import { ErrorState } from './ui';
import type { Review } from '../types/database';

/**
 * Reviews on a vendor's public profile.
 *
 * Shown without attribution: reviewer identity is an auth UUID no client role
 * can read, and nothing else about the reviewer is public.
 */
const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const VendorReviews = ({
  vendorId,
  rating,
  reviewCount,
  ratingIsDemo,
}: {
  vendorId: string;
  rating: number;
  reviewCount: number;
  /** Seeded demo figures, with no reviews behind them. */
  ratingIsDemo: boolean;
}) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReviews(await listVendorReviews(vendorId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reviews.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-10 border-t pt-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">Reviews</h2>
        {reviewCount > 0 && !ratingIsDemo && (
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <StarRating value={rating} size="sm" />
            {rating.toFixed(1)} · {reviewCount} review{reviewCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Showing a seeded score next to "no reviews yet" would read as customer
          feedback that does not exist. Say what the number actually is. */}
      {ratingIsDemo && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The {rating.toFixed(1)} rating shown for this listing is illustrative sample data, not
          customer feedback. It is replaced by the real average as soon as a completed booking is
          reviewed.
        </p>
      )}

      {loading && (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && reviews.length === 0 && (
        <p className="text-gray-600">
          No written reviews yet. Reviews can only be left by customers whose booking was
          completed.
        </p>
      )}

      {!loading && !error && reviews.length > 0 && (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <StarRating value={review.rating} size="sm" />
                <span className="text-sm text-gray-500">{formatTimestamp(review.created_at)}</span>
              </div>
              {review.body && (
                <p className="mt-2 whitespace-pre-line text-gray-800">{review.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VendorReviews;
