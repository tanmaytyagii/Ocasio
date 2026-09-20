import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getFilterOptions } from '../services/vendors';
import { Button } from './ui';
import type { FilterOptions } from '../types/database';

/**
 * Homepage hero.
 *
 * Runs edge to edge *and* under the header: `-mt-16 pt-16` cancels the shell's
 * fixed-header offset and pads the content back down. Previously the hero began
 * below an opaque white bar, which is what made a full-width section read as a
 * rectangle sitting inside the page. The header turns translucent over the
 * homepage hero (see Navbar) so the image is genuinely uninterrupted.
 *
 * Depth comes from stacked CSS layers rather than a library:
 *   1. the photograph, very slightly over-scaled so its edges never show
 *   2. a directional scrim, dark where the text sits and clear where the
 *      subject is
 *   3. a top scrim so white header text stays legible
 *   4. a bottom fade into the canvas colour, so the hero dissolves into the
 *      next section instead of ending on a hard line
 *
 * No parallax: a scroll-linked transform would cost a listener and a repaint on
 * the most-visited route, and would need unwinding for reduced-motion anyway.
 *
 * The category and city lists come from filter_options(), so the form cannot
 * offer a city with no vendors behind it. If that lookup fails the form still
 * works and falls back to a free-text search.
 */
const Hero = () => {
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getFilterOptions()
      .then((o) => {
        if (active) setOptions(o);
      })
      .catch(() => {
        if (active) setOptions(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (city) params.set('location', city);
    navigate(`/search?${params.toString()}`);
  };

  const selectClass =
    'h-12 w-full appearance-none rounded-control border border-line-strong bg-surface px-3.5 pr-9 text-sm text-ink ' +
    'transition-colors hover:border-line-strong focus:border-brand-500';

  const caret =
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z' clip-rule='evenodd'/%3E%3C/svg%3E\")] " +
    'bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat';

  return (
    <section
      className="relative isolate -mt-16 flex min-h-[520px] items-center overflow-hidden pt-16 sm:min-h-[70vh] lg:min-h-[82vh] lg:max-h-[880px]"
      aria-labelledby="hero-heading"
    >
      {/* 1 — photograph */}
      <img
        src="https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?ixlib=rb-1.2.1&auto=format&fit=crop&w=2400&q=80"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 -z-30 h-full w-full scale-[1.03] object-cover object-center"
      />

      {/* 2 — directional scrim: dense behind the text, open over the subject. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-gradient-to-r from-ink/90 via-ink/65 to-ink/20"
      />

      {/* 3 — top scrim so the translucent header stays readable, and 4 — a
          bottom fade that dissolves the hero into the section below.
          Explicit stops rather than from/via/to: a three-stop Tailwind gradient
          ramps across the whole height and washes the middle of the photograph
          out. Confining each fade to its own band keeps the image clean where
          the subject actually is. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(17_24_39_/_0.55)_0%,rgb(17_24_39_/_0.12)_18%,transparent_38%,transparent_78%,rgb(248_248_250_/_0.75)_94%,rgb(248_248_250)_100%)]"
      />

      <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="max-w-[46rem]">
          <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-brand-200 sm:text-sm">
            <span className="h-px w-8 bg-brand-300/70" aria-hidden="true" />
            Event vendor marketplace
          </p>

          <h1
            id="hero-heading"
            className="mt-4 text-[2.15rem] font-semibold leading-[1.06] tracking-[-0.025em] text-white sm:mt-5 sm:text-[3.25rem] lg:text-[4.25rem]"
          >
            Book the people who make your event work
          </h1>

          <p className="mt-4 max-w-xl text-[0.975rem] leading-relaxed text-white/80 sm:mt-6 sm:text-lg">
            Compare venues, caterers, photographers and decorators across India. Send a booking
            request, track it from request to completion, and review the work afterwards.
          </p>
        </div>

        {/*
          The discovery control reads as a panel lifted off the image rather
          than a form pasted onto it: a light hairline above, a deep shadow
          below, and a translucent surface that lets the photograph through at
          the edges.
        */}
        <form
          onSubmit={handleSearch}
          className="mt-7 max-w-3xl rounded-panel border border-white/15 bg-surface/95 p-3 shadow-[0_24px_60px_-12px_rgb(17_24_39_/_0.55)] backdrop-blur-md sm:mt-12 sm:p-4"
          role="search"
          aria-label="Find vendors"
        >
          <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:gap-3">
            <div className="flex-1">
              <label
                htmlFor="hero-category"
                className="mb-1 block px-0.5 text-xs font-medium uppercase tracking-wide text-muted sm:mb-1.5"
              >
                Service
              </label>
              <select
                id="hero-category"
                className={`${selectClass} ${caret}`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All services</option>
                {options?.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div
              className="hidden w-px self-stretch bg-line md:mb-1 md:block"
              aria-hidden="true"
            />

            <div className="flex-1">
              <label
                htmlFor="hero-city"
                className="mb-1 block px-0.5 text-xs font-medium uppercase tracking-wide text-muted sm:mb-1.5"
              >
                City
              </label>
              <select
                id="hero-city"
                className={`${selectClass} ${caret}`}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">All cities</option>
                {options?.locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="lg" className="h-12 md:w-auto md:px-7">
              <Search className="h-4 w-4" aria-hidden="true" />
              Search vendors
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default Hero;
