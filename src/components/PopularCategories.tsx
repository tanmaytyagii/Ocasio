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
     * The hero closes on an arc drawn in this section's colour, so this section
     * reads as rising up underneath it. No negative margin is needed any more —
     * the curve is the join.
     */
    <section className="relative z-10 overflow-hidden bg-canvas pb-20 pt-2 sm:pb-24 sm:pt-4">
      {/* Ambient lavender light bleeding down out of the hero, so the dark
          section above and the light one below share an atmosphere instead of
          meeting as two flat blocks. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-[30rem] w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(147_51_234_/_0.10)_0%,rgb(147_51_234_/_0.04)_45%,transparent_70%)] blur-2xl"
      />

      <div className="relative mx-auto max-w-[96rem] px-6 sm:px-8 lg:px-12 xl:px-16">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
          <div className="max-w-xl">
            <h2 className="text-display-sm text-ink">Browse by service</h2>
            <p className="mt-2.5 text-muted">
              Every category below has vendors you can book today.
            </p>
          </div>
          <Link
            to="/vendors"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            See all vendors
            <ArrowRight
              className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>

        {error && !loading && <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />}

        {/*
          `perspective` on the grid lets each card lift *toward* the viewer via
          translateZ rather than simply scaling — the difference between an
          object moving in space and a picture getting bigger. The movement is
          deliberately small so it reads as material, not as an animation, and
          the global prefers-reduced-motion rule collapses every transition here.
        */}
        <div className="grid grid-cols-1 gap-5 [perspective:1600px] sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] w-full animate-pulse rounded-[1.4rem] bg-line"
                />
              ))
            : !error &&
              categories.map((category) => (
                <Link
                  to={`/category/${category.category.toLowerCase()}`}
                  key={category.category}
                  className="group relative block rounded-[1.4rem] shadow-lift transition-[transform,box-shadow] duration-500 ease-out [transform-style:preserve-3d] hover:[transform:translate3d(0,-6px,40px)] hover:shadow-lift-hover focus-visible:[transform:translate3d(0,-6px,40px)] focus-visible:shadow-lift-hover"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[1.4rem] bg-ink-deep ring-1 ring-inset ring-white/10">
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
                      className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.09]"
                    />

                    {/* A deep floor for the label plus a whole-card wash that
                          lifts on hover, so the image brightens as it rises.
                          The floor is opaque at the base and still at 70% a
                          third of the way up: the brightest tiles (catering,
                          decoration) are near-white exactly where the label
                          sits, and a lighter scrim left it barely legible. */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[linear-gradient(to_top,rgb(8_11_22_/_0.97)_0%,rgb(8_11_22_/_0.86)_18%,rgb(8_11_22_/_0.52)_38%,rgb(8_11_22_/_0.14)_64%,transparent_100%)]"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-ink-deep/20 transition-opacity duration-500 group-hover:opacity-0"
                    />

                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <h3 className="text-[1.05rem] font-semibold text-white">
                        {category.category}
                      </h3>
                      <p className="mt-0.5 text-sm text-white/65">
                        {category.vendor_count} vendor
                        {category.vendor_count === 1 ? '' : 's'}
                      </p>

                      {/* Reserved height, so the card does not reflow when the
                            affordance appears. Keyboard focus gets it too. */}
                      <span className="mt-3 flex h-5 items-center gap-1.5 text-sm font-medium text-white opacity-0 transition-all duration-500 group-hover:opacity-100 group-focus-visible:opacity-100">
                        Browse
                        <ArrowRight
                          className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1"
                          aria-hidden="true"
                        />
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
