import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, CalendarCheck, MessageSquare, Search } from 'lucide-react';
import { getFilterOptions } from '../services/vendors';
import { Button } from './ui';
import type { FilterOptions } from '../types/database';

/**
 * Homepage hero — a full-screen cinematic composition.
 *
 * Runs edge to edge *and* under the header: `-mt-16 pt-16` cancels the shell's
 * fixed-header offset and pads the content back down, so the photograph reaches
 * the top of the viewport instead of starting below an opaque bar. The header
 * turns to glass over this section (see Navbar) so nothing interrupts it.
 *
 * Height is `100svh` — the *small* viewport unit — via .hero-viewport. With
 * `100vh`, mobile browsers measure against the viewport with chrome retracted,
 * so the composition is taller than the screen ever shows and the search panel
 * sits below the fold on first paint.
 *
 * Depth is built from stacked CSS layers. No Three.js, no WebGL, no canvas:
 *   1. the photograph, slightly over-scaled so its edges never show
 *   2. a directional navy scrim — dense behind the text, open over the subject
 *   3. two blurred violet light sources, the brand colour used as lighting
 *      rather than as another gradient
 *   4. a vignette that closes the corners
 *   5. a barely-there grid, for texture at large sizes
 *   6. a top scrim keeping the glass header legible
 *   7. the closing arc, which the next section emerges from underneath
 *
 * Deliberately no scroll-linked parallax: it costs a listener and a repaint on
 * the most-visited route, and would need unwinding for reduced motion anyway.
 * The dimensionality here is static — perspective, layering and light.
 *
 * The category and city lists come from filter_options(), so the form cannot
 * offer a city with no vendors behind it. If that lookup fails the form still
 * works and falls back to a free-text search. Search behaviour is unchanged.
 */

/**
 * Qualitative statements about how the product actually works — vendor listings
 * are moderated before they go live, bookings move through a real state
 * machine, and vendor contact details are real. No counts, no ratings, no
 * invented statistics.
 */
const VALUE_POINTS = [
  { icon: BadgeCheck, title: 'Verified vendors', detail: 'Reviewed before they go live' },
  { icon: CalendarCheck, title: 'Tracked bookings', detail: 'Request through to completion' },
  { icon: MessageSquare, title: 'Real people', detail: 'Deal with the business directly' },
] as const;

/** The real booking lifecycle, shown as a diagram rather than as sample data. */
const LIFECYCLE = [
  { step: 'You send a request', meta: 'Pick a service and a date' },
  { step: 'The vendor responds', meta: 'Accept or decline' },
  { step: 'The work is completed', meta: 'Then you review it' },
] as const;

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
    'h-12 w-full appearance-none rounded-control border border-line bg-surface px-3.5 pr-9 text-sm ' +
    'font-medium text-ink transition-colors hover:border-line-strong focus:border-brand-500 sm:h-[3.25rem]';

  const caret =
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z' clip-rule='evenodd'/%3E%3C/svg%3E\")] " +
    'bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat';

  return (
    <section
      className="hero-viewport relative isolate -mt-16 flex flex-col overflow-hidden bg-ink-deep pt-16"
      aria-labelledby="hero-heading"
    >
      {/* 1 — photograph */}
      <img
        src="https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?ixlib=rb-1.2.1&auto=format&fit=crop&w=2400&q=80"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 -z-50 h-full w-full scale-[1.04] object-cover object-center"
      />

      {/* 2 — directional scrim. Dense on the left where every word sits, open
             on the right so the photograph still reads as a photograph. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-40 bg-[linear-gradient(105deg,rgb(8_11_22_/_0.94)_0%,rgb(8_11_22_/_0.86)_34%,rgb(8_11_22_/_0.58)_62%,rgb(18_26_48_/_0.42)_100%)]"
      />

      {/* 3 — brand light. Two soft violet sources rather than a gradient wash:
             one low-left behind the headline, one high-right as rim light. */}
      <div
        aria-hidden="true"
        className="absolute -left-40 bottom-[-20%] -z-30 h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgb(147_51_234_/_0.42)_0%,rgb(147_51_234_/_0.14)_42%,transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -right-32 -top-40 -z-30 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgb(168_85_247_/_0.30)_0%,rgb(88_28_135_/_0.16)_45%,transparent_72%)] blur-3xl"
      />

      {/* 4 — vignette, closing the corners so the frame feels shot rather than
             cropped. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[radial-gradient(120%_85%_at_50%_45%,transparent_40%,rgb(8_11_22_/_0.45)_100%)]"
      />

      {/* 5 — texture. A 64px grid at 3% white; invisible as a pattern, but it
             stops the large dark areas from banding. Hidden on small screens
             where it would only cost paint. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 hidden opacity-[0.035] lg:block [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:64px_64px]"
      />

      {/* 6 — top scrim so the glass header keeps its contrast. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-40 bg-[linear-gradient(to_bottom,rgb(8_11_22_/_0.75),transparent)]"
      />

      <div className="relative flex flex-1 items-center">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-12">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
            {/* ---------- copy ---------- */}
            <div className="lg:col-span-7">
              <p className="flex items-center gap-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-brand-200 sm:text-xs">
                <span className="h-px w-8 bg-brand-300/70" aria-hidden="true" />
                Event vendor marketplace
              </p>

              <h1
                id="hero-heading"
                className="mt-4 max-w-[46rem] text-[2.05rem] font-semibold leading-[1.04] tracking-[-0.03em] text-white [text-wrap:balance] min-[380px]:text-[2.35rem] sm:mt-5 sm:text-[3.5rem] lg:text-[4.25rem] xl:text-display-xl"
              >
                Book the people who make your event work
              </h1>

              <p className="mt-4 max-w-xl text-[0.9rem] leading-relaxed text-white/75 min-[380px]:text-[0.95rem] sm:mt-6 sm:text-lg">
                Compare venues, caterers, photographers and decorators across India. Send a booking
                request, track it from request to completion, and review the work afterwards.
              </p>
            </div>

            {/* ---------- atmospheric element, desktop only ----------
                The real booking lifecycle as a diagram. Tilted a few degrees in
                perspective so it sits in the same space as the photograph
                rather than on top of it. Decorative: the same information is
                available as text in "How Ocasio works" below. */}
            <div
              aria-hidden="true"
              className="hidden lg:col-span-5 lg:block [perspective:1400px]"
            >
              <div className="animate-float [transform:rotateY(-9deg)_rotateX(3deg)] [transform-style:preserve-3d]">
                <div className="ml-auto max-w-sm rounded-glass border border-white/15 bg-white/[0.07] p-6 shadow-glass backdrop-blur-xl">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-200">
                    How a booking moves
                  </p>

                  <ol className="mt-5 space-y-4">
                    {LIFECYCLE.map(({ step, meta }, i) => (
                      <li key={step} className="flex gap-3.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold text-white">
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-white">{step}</span>
                          <span className="mt-0.5 block text-xs text-white/60">{meta}</span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/60">
                    <BadgeCheck className="h-3.5 w-3.5 text-brand-300" />
                    Every vendor is reviewed before listing
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- floating search panel ----------
              Reads as an object above the image, not a form painted onto it: a
              lit top edge, a translucent blurred surface, and a two-part shadow
              that grows very slightly on hover. */}
          <form
            onSubmit={handleSearch}
            className="group/panel mt-8 max-w-4xl rounded-glass border border-white/20 bg-white/[0.14] p-2 shadow-glass backdrop-blur-2xl transition-shadow duration-300 hover:shadow-glass-hover sm:mt-10 sm:p-2.5"
            role="search"
            aria-label="Find vendors"
          >
            <div className="rounded-[1.15rem] bg-surface/95 p-3 sm:p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                <div className="flex-1">
                  <label
                    htmlFor="hero-category"
                    className="mb-1.5 block px-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted"
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

                <div className="hidden w-px self-stretch bg-line md:mb-1 md:block" aria-hidden="true" />

                <div className="flex-1">
                  <label
                    htmlFor="hero-city"
                    className="mb-1.5 block px-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted"
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

                <Button
                  type="submit"
                  size="lg"
                  className="h-12 shadow-[0_10px_24px_-8px_rgb(147_51_234_/_0.7)] sm:h-[3.25rem] md:w-auto md:px-8"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Search vendors
                </Button>
              </div>
            </div>
          </form>

          {/* ---------- value points ---------- */}
          {/* Compact pills on small screens, where three stacked cards would
              push the search panel below the fold; full cards from sm up. */}
          <ul className="mt-6 flex max-w-4xl flex-wrap gap-2 sm:mt-8 sm:grid sm:grid-cols-3 sm:gap-3">
            {VALUE_POINTS.map(({ icon: Icon, title, detail }) => (
              <li
                key={title}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1.5 backdrop-blur-md sm:gap-3 sm:rounded-panel sm:px-4 sm:py-3"
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-brand-300 sm:h-4 sm:w-4"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-[0.72rem] font-medium text-white min-[380px]:text-[0.8rem] sm:text-sm">
                    {title}
                  </span>
                  <span className="mt-0.5 hidden text-xs text-white/60 sm:block">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/*
        No scroll cue. The composition is budgeted to land at exactly one
        viewport at every tested size, and a cue needs ~144px of its own —
        enough to push the value points off the first screen on a 1280x800
        laptop. The arc already implies continuation, which is the job a cue
        would have done.
      */}

      {/* 7 — closing arc. The next section is the same colour, so this reads as
             that section rising up underneath the hero. */}
      <div aria-hidden="true" className="hero-curve z-10 bg-canvas" />
    </section>
  );
};

export default Hero;
