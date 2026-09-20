import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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
  // This banquet-hall photo replaces one that started 404ing upstream and
  // rendered the tile as a broken image.
  Venues:
    'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
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
    /*
     * -mt-8 pulls the grid up into the hero's bottom fade, so the two sections
     * overlap slightly instead of meeting on a hard edge. pt-24 restores the
     * breathing room above the heading.
     */
    <section className="relative z-10 -mt-8 bg-canvas pb-16 pt-14 sm:pb-20 sm:pt-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
          <div className="max-w-xl">
            <h2 className="text-display-sm text-ink">Browse by service</h2>
            <p className="mt-2.5 text-muted">
              Every category below has vendors you can book today.
            </p>
          </div>
          <Link
            to="/vendors"
            className="text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            See all vendors →
          </Link>
        </div>

        {error && !loading && (
          <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
        )}

        {/*
          `perspective` on the grid lets each card lift toward the viewer rather
          than simply scaling. The movement is deliberately small — 4px and a
          deeper shadow — so it reads as material rather than as an animation.
          The global prefers-reduced-motion rule collapses both transitions.
        */}
        <div className="grid grid-cols-1 gap-6 [perspective:1200px] sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] w-full animate-pulse rounded-card bg-line" />
              ))
            : !error && categories.map((category) => (
                <Link
                  to={`/category/${category.category.toLowerCase()}`}
                  key={category.category}
                  className="group relative block rounded-card shadow-card transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_18px_40px_-12px_rgb(17_24_39_/_0.35)] focus-visible:-translate-y-1"
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-ink">
                    <img
                      src={CATEGORY_IMAGES[category.category] ?? FALLBACK_IMAGE}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      // A dead upstream URL should degrade to the dark card and
                      // its label, not to the browser's broken-image glyph.
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]"
                    />
                    {/* Two stacked gradients: a floor for the label, and a
                        whole-card wash that lifts slightly on hover. */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent opacity-90"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-ink/10 transition-opacity duration-300 group-hover:opacity-0"
                    />

                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <h3 className="text-lg font-semibold text-white">{category.category}</h3>
                      <p className="mt-0.5 text-sm text-white/70">
                        {category.vendor_count} vendor{category.vendor_count === 1 ? '' : 's'}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                        Browse
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
};

export default PopularCategories;
