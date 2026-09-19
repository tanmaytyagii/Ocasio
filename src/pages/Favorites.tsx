import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { listMyFavoriteVendors, removeFavorite } from '../services/favorites';
import { useAsync } from '../hooks/useAsync';
import { usePageMeta } from '../hooks/usePageMeta';
import VendorCard from '../components/VendorCard';
import { VendorGridSkeleton, ErrorState, EmptyState } from '../components/AsyncStates';

/**
 * Saved vendors, persisted per account.
 *
 * The Navbar has linked to /favorites since before Phase 0, but no route
 * existed, so the heart icon led to a blank page (audit BUG-6).
 */
const Favorites = () => {
  usePageMeta('Saved vendors — Ocasio');

  const { data, loading, error, retry } = useAsync(() => listMyFavoriteVendors(), []);

  const handleRemove = async (vendorId: string) => {
    await removeFavorite(vendorId);
    retry();
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-2 flex items-center gap-2 text-4xl font-bold text-gray-900">
          <Heart className="h-8 w-8 text-purple-600" aria-hidden="true" />
          Saved vendors
        </h1>
        <p className="mb-8 text-gray-600">
          {loading ? 'Loading…' : `${data?.length ?? 0} saved`}
        </p>

        {loading && <VendorGridSkeleton count={3} />}
        {error && !loading && <ErrorState message={error} onRetry={retry} />}

        {!loading && !error && data?.length === 0 && (
          <EmptyState
            title="Nothing saved yet"
            description="Save vendors while browsing and they will appear here, on any device you sign in from."
            action={
              <Link
                to="/vendors"
                className="rounded-lg bg-purple-600 px-5 py-2.5 text-white hover:bg-purple-700"
              >
                Browse vendors
              </Link>
            }
          />
        )}

        {!loading && !error && data && data.length > 0 && (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {data.map((vendor) => (
              <div key={vendor.id} className="relative">
                <VendorCard vendor={vendor} />
                <button
                  onClick={() => handleRemove(vendor.id)}
                  aria-label={`Remove ${vendor.business_name} from saved vendors`}
                  className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow-sm transition-colors hover:bg-white"
                >
                  <Heart className="h-5 w-5 fill-current text-purple-600" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Favorites;
