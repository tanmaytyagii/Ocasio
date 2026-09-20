import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { heroPhotoUrl } from '../../lib/media';

/**
 * The editorial half of the sign-in screen.
 *
 * Three compositions, not one composition scaled:
 *
 *   < md   a stacked brand band above the form: wordmark, then the eyebrow.
 *   md–lg  the same two pieces on one row, wordmark left and eyebrow right.
 *          Stacked, this band ran to 270px at 768 and pushed the form down the
 *          screen to say nothing more.
 *   lg+    the full-height panel: the homepage photograph, a falloff scrim
 *          rather than a flat overlay, and the editorial block anchored to the
 *          bottom of the frame with the wordmark at the top.
 *
 * No photograph is requested below lg at all, so a phone spends no bytes on an
 * image it would show a sliver of. The band's depth comes from the ink-deep
 * base and the violet ambient light the homepage hero already uses.
 *
 * The photograph is the one the homepage already ships, named once in
 * lib/media. It is requested at 1600px rather than the homepage's 2400px,
 * because this panel is roughly half a window wide.
 *
 * Nothing here is a claim. The eyebrow is the line the footer already carries,
 * and the supporting sentence names the four categories the marketplace
 * actually has. No counts, no badges, no testimonials.
 */

const DESKTOP = '(min-width: 1024px)';

/** True only where the photographic composition is the one being rendered. */
function useDesktopPanel(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return isDesktop;
}

const Rule = () => <span className="h-px w-4 bg-white/30" aria-hidden="true" />;

const AuthEditorialPanel = () => {
  const isDesktop = useDesktopPanel();

  return (
    <aside
      className="animate-fade-in relative isolate flex flex-col overflow-hidden bg-ink-deep
                 px-[clamp(1.25rem,5vw,2rem)] pb-7 pt-6
                 md:flex-row md:items-center md:justify-between md:py-6
                 lg:flex-col lg:items-stretch lg:justify-start lg:px-[clamp(2.5rem,4vw,4.5rem)] lg:pb-[clamp(2.75rem,4vw,4rem)] lg:pt-[clamp(2.25rem,3.2vw,3.5rem)]"
    >
      {/* ── background ──────────────────────────────────────────────────────
          Rendered only at lg, so the element never exists on a phone and the
          browser never fetches the file. A `hidden` class would still
          download it. */}
      {isDesktop && (
        <img
          src={heroPhotoUrl(1600)}
          alt=""
          aria-hidden="true"
          fetchPriority="low"
          decoding="async"
          className="absolute inset-0 -z-30 h-full w-full object-cover [object-position:34%_center]"
        />
      )}

      {/* A falloff towards the type, not a flat sheet over the picture: dense
          at the bottom-left where the editorial block sits, gone by the top
          right, so the photograph still reads as a photograph.

          The 56% stop is 0.44 rather than 0.36 because measurement put the
          eyebrow at 4.47:1 over a bright patch of the photograph at 2560 —
          under AA for 9.6px text. The eyebrow itself went from 75% to 90%
          white in the same pass; the two together carry it well clear without
          flattening the picture. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[linear-gradient(to_top,rgb(6_9_18_/_0.95)_0%,rgb(6_9_18_/_0.76)_30%,rgb(6_9_18_/_0.44)_56%,rgb(6_9_18_/_0.12)_80%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[linear-gradient(105deg,rgb(6_9_18_/_0.8)_0%,rgb(6_9_18_/_0.44)_38%,rgb(6_9_18_/_0.12)_68%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-32 bg-[linear-gradient(to_bottom,rgb(6_9_18_/_0.72),transparent)] lg:h-44"
      />

      {/* The violet is light, never a surface — the same ambient source the
          homepage hero uses, and the only thing giving the phone band depth. */}
      <div
        aria-hidden="true"
        className="absolute -left-40 bottom-[-40%] -z-10 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgb(147_51_234_/_0.22)_0%,rgb(147_51_234_/_0.07)_46%,transparent_72%)] blur-3xl lg:bottom-[-18%] lg:h-[40rem] lg:w-[40rem]"
      />

      {/* ── wordmark ────────────────────────────────────────────────────── */}
      <Link
        to="/"
        aria-label="Ocasio home"
        // h-11 rather than the text's natural 39px: this is a navigation
        // control, so it gets a 44px target like every other one here.
        className="relative -my-0.5 inline-flex h-11 w-fit items-center text-[1.5rem] font-semibold tracking-[-0.045em] text-white transition-colors hover:text-brand-200 lg:text-[1.625rem]"
      >
        Ocasio
      </Link>

      {/* ── editorial block ──────────────────────────────────────────────
          Anchored to the bottom of the frame on desktop; directly under the
          wordmark on a phone, where there is no frame to anchor to. */}
      <div className="relative mt-4 md:mt-0 md:text-right lg:mt-auto lg:pt-16 lg:text-left">
        <p className="flex items-center gap-3 text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-white/90 md:justify-end lg:justify-start">
          Events
          <Rule />
          People
          <Rule />
          Places
        </p>

        <p className="mt-5 hidden max-w-[15ch] text-[length:clamp(1.75rem,3.1vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-white [text-wrap:balance] lg:block">
          Extraordinary events start with the right people.
        </p>

        <p className="mt-5 hidden max-w-[26rem] text-[0.9375rem] leading-[1.7] text-white/70 lg:block">
          Find and book venues, caterers, photographers and decorators across India — then follow
          every request through to completion.
        </p>
      </div>
    </aside>
  );
};

export default AuthEditorialPanel;
