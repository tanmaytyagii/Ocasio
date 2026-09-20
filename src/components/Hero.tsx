import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getFilterOptions } from '../services/vendors';
import { Button } from './ui';
import type { FilterOptions } from '../types/database';

/**
 * Homepage hero — one art-directed composition, not a stack of UI on an image.
 *
 * Runs edge to edge *and* under the header: the negative top margin cancels the
 * shell's fixed-header offset and the padding restores it, so the photograph
 * reaches the top of the viewport. The header is transparent over this section
 * (see Navbar) so nothing interrupts it.
 *
 * Height is `100svh` — the *small* viewport unit — via .hero-viewport. `100vh`
 * measures against the viewport with mobile browser chrome retracted, which puts
 * the search slab below the fold on first paint.
 *
 * ── Art direction ────────────────────────────────────────────────────────────
 *
 * The composition is asymmetric and deliberately wide. Content runs to 96rem
 * rather than the 80rem used elsewhere in the product, because a centred
 * container is what made this read as a landing page: the photograph became
 * background behind a column instead of the subject of the frame.
 *
 * The scrim is directional, not global. It is near-opaque at the left edge
 * where every word sits and falls to 10% at the right, so the hands, the ring
 * and the flowers stay legible as photography. An even overlay dark enough for
 * text is always too dark for the picture.
 *
 * Depth is four planes, and they are meant to be *seen*:
 *     photograph → atmospheric light → search slab → lifecycle glass
 * The slab carries the largest shadow and sits nearest the viewer; the
 * lifecycle panel is rotated away and sits further back, smaller and fainter,
 * so it reads as depth rather than as a second focal point.
 *
 * There is no decorative grid, no icon set and no row of feature pills. Each
 * was removed rather than restyled — they were the things making a photograph
 * look like a dashboard.
 *
 * No scroll-linked parallax: it costs a listener and a repaint on the
 * most-visited route, and would need unwinding for reduced motion anyway.
 *
 * The category and city lists come from filter_options(), so the form cannot
 * offer a city with no vendors behind it. If that lookup fails the form still
 * works and falls back to a free-text search. Search behaviour is unchanged.
 */

/** The real booking lifecycle, shown as an annotation rather than sample data. */
const LIFECYCLE = [
  { n: '01', step: 'You send a request' },
  { n: '02', step: 'The vendor responds' },
  { n: '03', step: 'The work is completed' },
] as const;

/**
 * Qualitative, and each one is true of the product: listings are moderated
 * before they go live, bookings move through a real state machine, and vendor
 * contact details are real. No counts, ratings or invented statistics.
 */
const TRUST = ['Verified vendors', 'Tracked to completion', 'Direct contact'] as const;

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

  const fieldLabel = 'block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted';

  const selectClass =
    'mt-1 h-10 w-full appearance-none sm:mt-1.5 sm:h-11 rounded-control border-0 bg-transparent px-0 pr-8 text-[0.95rem] ' +
    'font-medium text-ink focus:ring-0 sm:text-base';

  const caret =
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z' clip-rule='evenodd'/%3E%3C/svg%3E\")] " +
    'bg-[length:1.1rem] bg-[right_0.25rem_center] bg-no-repeat';

  return (
    <section
      className="hero-viewport relative isolate -mt-16 flex flex-col overflow-hidden bg-ink-deep pt-16 lg:-mt-20 lg:pt-20"
      aria-labelledby="hero-heading"
    >
      {/* ── plane 1 · photograph ───────────────────────────────────────────── */}
      <img
        src="https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?ixlib=rb-1.2.1&auto=format&fit=crop&w=2400&q=80"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 -z-50 h-full w-full scale-[1.04] object-cover object-[62%_center] lg:object-center"
      />

      {/* Directional scrim. Near-opaque under the words, almost clear over the
          subject — the difference between a photograph and a dark rectangle. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-40 bg-[linear-gradient(100deg,rgb(6_9_18_/_0.95)_0%,rgb(6_9_18_/_0.88)_22%,rgb(6_9_18_/_0.66)_42%,rgb(6_9_18_/_0.34)_64%,rgb(10_16_32_/_0.14)_84%,rgb(12_20_40_/_0.08)_100%)]"
      />
      {/* A floor under the text column only, so the copy holds contrast without
          darkening the right half of the frame. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-40 bg-[linear-gradient(to_top,rgb(6_9_18_/_0.72)_0%,rgb(6_9_18_/_0.22)_34%,transparent_62%)]"
      />

      {/* ── plane 2 · atmospheric light ────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="absolute -left-56 bottom-[-28%] -z-30 h-[52rem] w-[52rem] rounded-full bg-[radial-gradient(circle,rgb(147_51_234_/_0.38)_0%,rgb(147_51_234_/_0.12)_44%,transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -right-40 top-[-18%] -z-30 h-[44rem] w-[44rem] rounded-full bg-[radial-gradient(circle,rgb(196_181_253_/_0.22)_0%,rgb(126_34_206_/_0.12)_46%,transparent_72%)] blur-3xl"
      />
      {/* Vignette, lighter than before so it shapes the frame without flattening
          the photograph. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[radial-gradient(130%_95%_at_46%_44%,transparent_46%,rgb(6_9_18_/_0.38)_100%)]"
      />
      {/* Just enough darkness at the very top for white nav text. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-36 bg-[linear-gradient(to_bottom,rgb(6_9_18_/_0.62),transparent)]"
      />

      <div className="relative flex flex-1 items-center">
        <div className="mx-auto w-full max-w-[96rem] px-6 pb-[clamp(60px,8vw,150px)] pt-8 sm:px-8 sm:pt-10 lg:px-12 lg:pt-10 xl:px-16">
          <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-10">
            {/* ── copy + search: ~58% of the composition ──────────────────── */}
            <div className="lg:col-span-7 xl:col-span-7">
              <p className="flex items-center gap-3 text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-white/70">
                <span className="h-px w-7 bg-white/30" aria-hidden="true" />
                Event vendor marketplace
              </p>

              <h1
                id="hero-heading"
                className="mt-5 max-w-[15ch] sm:mt-6 text-[clamp(2rem,6.1vw,5.25rem)] font-semibold leading-[0.99] tracking-[-0.035em] text-white [text-wrap:balance]"
              >
                Book the people who make your event work
              </h1>

              <p className="mt-4 max-w-[34rem] text-[0.875rem] leading-[1.6] text-white/65 sm:mt-7 sm:text-[1.05rem] sm:leading-relaxed">
                Compare venues, caterers, photographers and decorators across India. Send a booking
                request, track it from request to completion, and review the work afterwards.
              </p>

              {/* ── plane 3 · the search slab ─────────────────────────────────
                  Ocasio's primary interaction, treated as one object: a single
                  glass surface with the fields sitting *inside* it, divided by
                  hairlines rather than boxed into separate controls. The
                  previous version was a form in a container — three bordered
                  inputs read as a form no matter what surrounds them.

                  `perspective` on the wrapper with translateZ on the slab puts
                  it genuinely nearer the viewer than the photograph, which is
                  what the shadow is describing. */}
              <div className="mt-8 max-w-[44rem] [perspective:1600px] sm:mt-10">
                <div className="relative [transform:translateZ(60px)] [transform-style:preserve-3d]">
                  {/* Violet light pooling under the slab — the reflection an
                      object this close to the surface would actually cast. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-8 -bottom-6 -z-10 h-24 rounded-full bg-brand-600/40 blur-3xl"
                  />

                  <form
                    onSubmit={handleSearch}
                    className="glass-sheen rounded-[1.75rem] border border-white/20 bg-white/[0.10] p-1.5 shadow-[0_2px_8px_-2px_rgb(6_9_18_/_0.4),0_40px_90px_-24px_rgb(6_9_18_/_0.85)] backdrop-blur-2xl"
                    role="search"
                    aria-label="Find vendors"
                  >
                    {/* Inner highlight: a hairline of light along the top edge,
                        which is what makes glass read as glass. */}
                    <div className="relative rounded-[1.4rem] bg-surface/95 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.9)]">
                      <div className="flex flex-col divide-y divide-line sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0">
                        <div className="flex-1 px-5 py-3 sm:py-4">
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

                        <div className="flex-1 px-5 py-3 sm:py-4">
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

                        <div className="flex items-center p-2.5 sm:p-2">
                          <Button
                            type="submit"
                            size="lg"
                            className="h-12 w-full rounded-[1.1rem] shadow-[0_8px_24px_-8px_rgb(147_51_234_/_0.85)] sm:h-full sm:w-auto sm:px-7"
                          >
                            Search vendors
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* One quiet line, no cards. Replaces three bordered feature pills
                  that made the composition read as a template. */}
              <p className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[0.7rem] text-white/55 sm:mt-6 sm:gap-x-3 sm:text-[0.8rem]">
                {TRUST.map((item, i) => (
                  <span key={item} className="flex items-center gap-3">
                    {i > 0 && (
                      <span className="h-1 w-1 rounded-full bg-white/35" aria-hidden="true" />
                    )}
                    {item}
                  </span>
                ))}
              </p>
            </div>

            {/* ── plane 4 · lifecycle glass ─────────────────────────────────
                Set low and right, well clear of the headline, rotated away from
                the viewer and sitting further back than the slab. Small, faint
                and secondary by design: it is depth in the frame, not a second
                thing to read.

                The float animation and the rotation are on separate elements on
                purpose. On one element the animation's `transform` replaces the
                static one outright, which silently flattened the rotation — the
                panel was rendering face-on the whole time. */}
            <div
              aria-hidden="true"
              className="hidden lg:col-span-5 lg:flex lg:items-end lg:justify-end lg:pb-4 [perspective:1600px]"
            >
              <div className="animate-float">
                <div className="w-[17.5rem] [transform:rotateY(-14deg)_rotateX(5deg)] [transform-style:preserve-3d]">
                  <div className="rounded-[1.6rem] border border-white/15 bg-ink-deep/70 px-6 py-6 shadow-[0_30px_80px_-28px_rgb(6_9_18_/_0.9)] backdrop-blur-2xl">
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-white/60">
                      How a booking moves
                    </p>

                    <ol className="mt-5 space-y-0">
                      {LIFECYCLE.map(({ n, step }, i) => (
                        <li key={n} className="relative flex gap-4 pb-5 last:pb-0">
                          {/* Hairline connecting the markers into one object. */}
                          {i < LIFECYCLE.length - 1 && (
                            <span className="absolute left-[0.6rem] top-5 h-full w-px bg-gradient-to-b from-white/20 to-white/5" />
                          )}
                          <span className="relative z-10 font-mono text-[0.7rem] leading-5 tracking-widest text-brand-300/90">
                            {n}
                          </span>
                          <span className="text-[0.82rem] leading-5 text-white/85">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The light half of the page rising underneath, carrying violet ambient
          light up into the dark. */}
      <div aria-hidden="true" className="hero-curve z-10 bg-canvas" />
    </section>
  );
};

export default Hero;
