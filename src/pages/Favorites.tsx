import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { listMyFavoriteVendors } from '../services/favorites';
import { useFavorites } from '../contexts/FavoritesContext';
import { usePageMeta } from '../hooks/usePageMeta';
import VendorCard from '../components/VendorCard';
import { VendorGridSkeleton, ErrorState, EmptyState } from '../components/ui';
import type { PublicVendor } from '../types/database';

/**
 * Saved vendors, persisted per account.
 *
 * The list is re-read whenever the shared favourite set changes, so unsaving
 * from a card here removes it without a manual refresh.
 */
const Favorites = () => {
  usePageMeta('Saved vendors — Ocasio');

  const { favoriteIds } = useFavorites();
  const [vendors, setVendors] = useState<PublicVendor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVendors(await listMyFavoriteVendors());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load your saved vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reflect unsaves immediately without refetching on every toggle.
  const visible = vendors?.filter((v) => favoriteIds.has(v.id)) ?? [];

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-2 flex items-center gap-2 text-4xl font-bold text-ink">
          <Heart className="h-8 w-8 text-brand-700" aria-hidden="true" />
          Saved vendors
        </h1>
        <p className="mb-8 text-muted" aria-live="polite">
          {loading ? 'Loading…' : `${visible.length} saved`}
        </p>

        {loading && <VendorGridSkeleton count={3} />}
        {error && !loading && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            title="Nothing saved yet"
            description="Save vendors while browsing and they will appear here, on any device you sign in from."
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

        {!loading && !error && visible.length > 0 && (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Favorites;
