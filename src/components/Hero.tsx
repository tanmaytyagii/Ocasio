import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getFilterOptions } from '../services/vendors';
import type { FilterOptions } from '../types/database';

/**
 * Homepage hero — one art-directed composition.
 *
 * Runs edge to edge *and* under the header: the negative top margin cancels the
 * shell's fixed-header offset and the padding restores it, so the photograph
 * reaches the top of the viewport.
 *
 * Height comes from .hero-viewport: a full small-viewport screen on phones, and
 * 88svh from lg up so the arc and the first inches of the next section fall
 * inside the fold. `svh` rather than `vh` because `vh` measures against the
 * viewport with mobile browser chrome retracted, which would put the search
 * object below the fold on first paint.
 *
 * ── Art direction ────────────────────────────────────────────────────────────
 *
 * Four spatial planes, arranged as one scene rather than a row of components:
 *
 *   background   the photograph and its light — no transform at all
 *   midground    the copy, held to the left
 *   foreground   the search object, translateZ(50px), crossing the boundary
 *                between the typographic canvas and the photograph
 *   far fore.    the lifecycle annotation, translateZ(90px), pushed out of the
 *                content grid toward the right edge
 *
 * The scrim is a falloff, not an overlay: opaque at the left edge where the
 * typography sits, gone entirely by the right. The right third is meant to read
 * as photography — hand, ring, watch, flowers — not as texture under a dark
 * sheet. An even overlay dark enough for text is always too dark for a picture.
 *
 * The one signature is the violet thread: a thin line of light running out of
 * the left edge of the lifecycle annotation back toward the search object. It
 * lives inside the rotated element, so the same perspective carries it and it
 * reads as passing *through* the scene rather than being drawn on top of it.
 *
 * Violet is lighting here, never a surface. Every purple in this file is either
 * the brand control or light at ambient strength.
 *
 * No scroll-linked parallax: it costs a listener and a repaint on the
 * most-visited route, and would need unwinding for reduced motion anyway.
 *
 * The category and city lists come from filter_options(), so the form cannot
 * offer a city with no vendors behind it. If that lookup fails the form still
 * works and falls back to a free-text search. Search behaviour is unchanged.
 */

/** The real booking lifecycle, as an annotation rather than sample data. */
const LIFECYCLE = [
  { n: '01', title: 'Request', detail: 'You choose a service and date' },
  { n: '02', title: 'Response', detail: 'The vendor accepts or declines' },
  { n: '03', title: 'Completion', detail: 'You review the work' },
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

  const fieldLabel = 'block text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted';

  // No control chrome of its own: the cell it sits in is the control.
  const selectClass =
    'mt-1.5 -ml-0.5 w-full cursor-pointer appearance-none truncate rounded-sm border-0 bg-transparent ' +
    'py-0 pl-0.5 pr-7 text-[1.0625rem] font-medium leading-6 text-ink focus:ring-0';

  const caret =
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z' clip-rule='evenodd'/%3E%3C/svg%3E\")] " +
    'bg-[length:1.05rem] bg-[right_0.35rem_center] bg-no-repeat';

  return (
    <section
      className="hero-viewport relative isolate -mt-16 flex flex-col overflow-hidden bg-ink-deep pt-16 lg:-mt-20 lg:pt-20"
      aria-labelledby="hero-heading"
    >
      {/* ── background ─────────────────────────────────────────────────────── */}
      <img
        src="https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?ixlib=rb-1.2.1&auto=format&fit=crop&w=2400&q=80"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 -z-50 h-full w-full scale-[1.04] object-cover [object-position:var(--hero-image-pos)]"
      />

      {/* Falloff, not an overlay: opaque canvas on the left, gone by the right. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-40 bg-[linear-gradient(96deg,rgb(6_9_18_/_0.97)_0%,rgb(6_9_18_/_0.94)_26%,rgb(6_9_18_/_0.72)_40%,rgb(6_9_18_/_0.38)_54%,rgb(6_9_18_/_0.14)_70%,rgb(6_9_18_/_0.04)_86%,transparent_100%)]"
      />
      {/* A short floor, so the copy keeps contrast without darkening the frame. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-40 [background-image:var(--hero-floor)]"
      />

      {/* Studio light, not gradients: two soft sources at ambient strength. */}
      <div
        aria-hidden="true"
        className="absolute -left-64 bottom-[-30%] -z-30 h-[56rem] w-[56rem] rounded-full bg-[radial-gradient(circle,rgb(147_51_234_/_0.16)_0%,rgb(147_51_234_/_0.05)_46%,transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -right-48 top-[-22%] -z-30 h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgb(221_214_254_/_0.10)_0%,rgb(126_34_206_/_0.05)_48%,transparent_74%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[radial-gradient(135%_100%_at_44%_42%,transparent_50%,rgb(6_9_18_/_0.34)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-36 bg-[linear-gradient(to_bottom,rgb(6_9_18_/_0.55),transparent)]"
      />

      <div className="relative flex flex-1 items-end lg:items-center">
        <div className="shell shell-query pb-[clamp(72px,8vw,132px)] pt-24 lg:pt-10">
          <div className="grid gap-y-10 lg:[grid-template-columns:minmax(0,1fr)_var(--hero-card)] lg:items-center lg:gap-x-[clamp(2rem,4cqw,4rem)]">
            {/* ── midground · copy ─────────────────────────────────────────── */}
            <div>
              <p className="flex items-center gap-3 text-[0.6rem] font-medium uppercase tracking-[0.34em] text-white/80">
                <span className="h-px w-6 bg-white/35" aria-hidden="true" />
                Event vendor marketplace
              </p>

              <h1
                id="hero-heading"
                className="mt-6 max-w-[19ch] text-[length:var(--hero-title)] font-semibold leading-[0.95] tracking-[-0.042em] text-white [text-wrap:balance]"
              >
                Book the people who make your event work
              </h1>

              <p className="mt-6 max-w-[30rem] text-[0.875rem] leading-[1.7] text-white/55 sm:text-[0.95rem]">
                Compare venues, caterers, photographers and decorators across India. Send a booking
                request, track it from request to completion, and review the work afterwards.
              </p>
            </div>

            {/* ── far foreground · lifecycle annotation ─────────────────────
                Pushed out of the content grid toward the right edge and lifted
                above the search object, so the two never sit on one baseline.
                Smoked glass at the lowest opacity that still holds white text
                against the bright half of the photograph. */}
            <div
              aria-hidden="true"
              className="pointer-events-none hidden [perspective:1400px] lg:block lg:translate-y-[clamp(1rem,2.5cqw,2.75rem)]"
            >
              <div className="animate-float ml-auto w-full max-w-[var(--hero-card)]">
                <div className="relative [transform:translateZ(90px)_rotateY(-13deg)_rotateX(3deg)] [transform-style:preserve-3d]">
                  {/* ── the signature ──────────────────────────────────────
                      A thread of violet light running back toward the search
                      object. Inside the rotated element, so the perspective
                      carries it and it reads as passing through the scene. */}
                  <span className="absolute right-full top-[70%] h-px w-[min(16vw,13.5rem)] origin-right -rotate-[32deg] bg-[linear-gradient(to_left,rgb(233_213_255_/_0.95),rgb(216_180_254_/_0.42)_46%,transparent_95%)] shadow-[0_0_8px_0_rgb(216_180_254_/_0.55)]">
                    <span className="absolute -left-px top-1/2 h-[4px] w-[4px] -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_4px_rgb(216_180_254_/_0.7)]" />
                  </span>

                  <div className="rounded-[1.25rem] border border-white/12 bg-ink-deep/55 px-6 py-7 shadow-[0_40px_90px_-32px_rgb(6_9_18_/_0.95)] backdrop-blur-2xl">
                    <p className="text-[0.55rem] font-medium uppercase tracking-[0.32em] text-white/55">
                      How a booking moves
                    </p>

                    <ol className="mt-6 space-y-5">
                      {LIFECYCLE.map(({ n, title, detail }) => (
                        <li key={n} className="flex gap-4">
                          <span className="font-mono text-[0.625rem] leading-[1.15rem] tracking-[0.1em] text-brand-200/80">
                            {n}
                          </span>
                          <span>
                            <span className="block text-[0.8rem] font-medium leading-[1.15rem] text-white/95">
                              {title}
                            </span>
                            <span className="mt-0.5 block text-[0.7rem] leading-4 text-white/60">
                              {detail}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── foreground · the search object ───────────────────────────────
              Deliberately wider than the copy column, so it crosses the line
              between the typographic canvas and the photograph instead of
              sitting inside one of them. One object: no control carries a
              border of its own, the cells are divided by hairlines, and the
              whole thing is lifted 50px off the background plane with a shallow
              rotateX so its top edge catches light. */}
          <div className="mt-10 w-full max-w-[var(--hero-search-max)] [perspective:1800px] sm:mt-12 lg:mt-14">
            <div className="relative [transform:translateZ(50px)_rotateX(1.2deg)] [transform-style:preserve-3d]">
              {/* The light this object pools on the surface beneath it. */}
              <div
                aria-hidden="true"
                className="absolute inset-x-12 -bottom-4 -z-10 h-16 rounded-[50%] bg-brand-600/25 blur-2xl"
              />

              <form
                onSubmit={handleSearch}
                className="glass-sheen rounded-[1.5rem] bg-white/[0.07] p-[1.5px] shadow-[0_1px_0_0_rgb(255_255_255_/_0.14),0_50px_100px_-30px_rgb(6_9_18_/_0.9)] backdrop-blur-2xl"
                role="search"
                aria-label="Find vendors"
              >
                <div className="rounded-[1.4rem] bg-surface/[0.97] shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.85)]">
                  <div className="flex flex-col divide-y divide-line/70 sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0">
                    <div className="flex-1 px-6 py-4 sm:py-5">
                      <label htmlFor="hero-category" className={fieldLabel}>
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

                    <div className="flex-1 px-6 py-4 sm:py-5">
                      <label htmlFor="hero-city" className={fieldLabel}>
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

                    {/* The action is a cell like the others, not a slab of
                        purple dropped into a form. The brand colour survives as
                        one small physical control. */}
                    <button
                      type="submit"
                      aria-label="Search vendors"
                      className="group/sub flex items-center justify-between gap-5 rounded-b-[1.4rem] px-6 py-4 text-left transition-colors hover:bg-brand-50/70 sm:rounded-b-none sm:rounded-r-[1.4rem] sm:py-5"
                    >
                      <span>
                        <span className={fieldLabel}>Search</span>
                        <span className="mt-1.5 block text-[1.0625rem] font-medium leading-6 text-ink">
                          Find vendors
                        </span>
                      </span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-[0_6px_18px_-6px_rgb(147_51_234_/_0.9)] transition-transform duration-300 group-hover/sub:translate-x-0.5">
                        <ArrowRight className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="hero-curve z-10 bg-canvas" />
    </section>
  );
};

export default Hero;
