import { Check } from 'lucide-react';
import { ButtonLink } from './ui';

/**
 * Vendor acquisition card.
 *
 * The contrast beat of the lower page: a dark editorial card on the same white
 * surface as the section above it, rather than a full-bleed band. The card is
 * the moment; the page around it stays calm.
 *
 * Every claim below is checked against what the product actually does:
 *
 *   "Reviewed before listing"   vendors.status starts 'pending' and
 *                               protect_vendor_moderated_fields() stops a
 *                               vendor approving themselves (migration …0002).
 *   "Accept or decline requests" transition_booking_status() plus the Bookings
 *                               tab of the vendor dashboard (…0004).
 *   "Tracked to completion"     accepted → completed, the same state machine.
 *
 * Deliberately absent: any vendor, customer or booking count, and any claim
 * about managing services — the vendor dashboard has an Overview and a Bookings
 * tab and no service editor, so that would not be true. There is one action,
 * not a primary and a decorative secondary pointing at the same route.
 */
const TRUST = [
  'Reviewed before listing',
  'Accept or decline requests',
  'Tracked to completion',
];

/** Already part of the project's imagery — no new external asset. */
const CTA_IMAGE =
  'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?ixlib=rb-1.2.1&auto=format&fit=crop&w=1400&q=80';

const VendorCta = () => (
  <section className="bg-surface pb-[clamp(4rem,7vw,7rem)]">
    <div className="shell">
      <div className="relative isolate overflow-hidden rounded-[clamp(1.25rem,2vw,2rem)] bg-ink-deep shadow-[0_28px_70px_-32px_rgb(8_11_22_/_0.6)]">
        {/* Violet at ambient strength, matching the hero's treatment. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgb(147_51_234_/_0.22)_0%,rgb(147_51_234_/_0.06)_48%,transparent_72%)] blur-3xl"
        />

        <div className="flex flex-col lg:block">
          {/*
            Below the copy on a phone, and the right half of the card from lg up.
            The gradient turns with it: down the image on mobile, across the card
            on desktop, so the photograph always dissolves into the surface the
            text sits on rather than ending on an edge.
          */}
          <div className="relative order-2 h-52 w-full sm:h-64 lg:absolute lg:inset-y-0 lg:right-0 lg:order-none lg:h-full lg:w-[52%]">
            <img
              src={CTA_IMAGE}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(8_11_22)_0%,rgb(8_11_22_/_0.32)_20%,transparent_52%)] lg:bg-[linear-gradient(to_right,rgb(8_11_22)_0%,rgb(8_11_22_/_0.92)_18%,rgb(8_11_22_/_0.5)_48%,rgb(8_11_22_/_0.12)_78%,transparent_100%)]"
            />
          </div>

          <div className="relative order-1 p-[clamp(1.75rem,4vw,4rem)] lg:order-none lg:w-[56%]">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-300">
              For vendors
            </p>

            <h2 className="mt-4 text-display-sm text-white">Run an events business?</h2>

            <p className="mt-4 max-w-lg text-[1.0625rem] leading-relaxed text-white/70">
              List your services on Ocasio and receive booking requests you can accept, decline and
              manage in one place. Applications are reviewed before a listing goes live.
            </p>

            <div className="mt-8">
              <ButtonLink to="/become-vendor" size="lg" className="w-full sm:w-auto">
                List your business
              </ButtonLink>
            </div>

            <ul className="mt-9 flex flex-col gap-3 border-t border-white/10 pt-7 sm:flex-row sm:flex-wrap sm:gap-x-7">
              {TRUST.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[0.875rem] text-white/65">
                  <Check className="h-4 w-4 shrink-0 text-brand-300" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default VendorCta;
