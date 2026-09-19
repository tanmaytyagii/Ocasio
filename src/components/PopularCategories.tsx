import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCategoryCounts } from '../services/vendors';
import { ErrorState } from './ui';
import type { CategoryCount } from '../types/database';

/**
 * Category tiles. The imagery is a fixed editorial choice; the vendor counts
 * come from the database, so a tile cannot advertise a category that has no
 * vendors behind it.
 */
const CATEGORY_IMAGES: Record<string, string> = {
  Venues:
    'https://images.unsplash.com/photo-1604016552404-22e1e27441ce?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
  Catering:
    'https://images.unsplash.com/photo-1555244162-803834f70033?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
  Photography:
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
  Decoration:
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
};

const FALLBACK_IMAGE = CATEGORY_IMAGES.Venues;

const PopularCategories = () => {
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getCategoryCounts()
      .then((c) => {
        if (active) setCategories(c);
      })
      .catch((e: unknown) => {
        // Previously this swallowed the failure and hid the section, so a
        // broken load was indistinguishable from an empty catalogue. It now
        // reports like every other async surface.
        if (active) setError(e instanceof Error ? e.message : 'Unable to load categories');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  // An empty catalogue is still a legitimate reason to render nothing; a
  // failure is not.
  if (!loading && !error && categories.length === 0) return null;

  return (
    <div className="bg-gray-50 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">Popular categories</h2>

        {error && !loading && (
          <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
        )}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-64 w-full animate-pulse rounded-lg bg-gray-200" />
              ))
            : !error && categories.map((category) => (
                <Link
                  to={`/category/${category.category.toLowerCase()}`}
                  key={category.category}
                  className="group relative cursor-pointer"
                >
                  <div className="relative h-64 w-full overflow-hidden rounded-lg">
                    <img
                      src={CATEGORY_IMAGES[category.category] ?? FALLBACK_IMAGE}
                      alt={category.category}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4">
                      <h3 className="text-xl font-semibold text-white">{category.category}</h3>
                      <p className="text-sm text-white/80">
                        {category.vendor_count} vendor{category.vendor_count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </div>
  );
};

export default PopularCategories;
