import { Search, CalendarCheck, Star } from 'lucide-react';

/**
 * How the product actually works.
 *
 * Each step describes something the system genuinely does — the booking
 * lifecycle from migration 20260919000004 and the review gating from
 * 20260919000006. Nothing here promises messaging, availability, notifications
 * or payments that have not been built.
 */
const STEPS = [
  {
    icon: Search,
    title: 'Find a vendor',
    body: 'Search and filter by service, city, price and rating. Every listing is a real record with its services and pricing attached.',
  },
  {
    icon: CalendarCheck,
    title: 'Request a booking',
    body: 'Pick a service and a date and send a request. The vendor accepts or declines it, and you can follow the status and cancel while it is still open.',
  },
  {
    icon: Star,
    title: 'Review the work',
    body: 'Once a booking is marked completed you can leave a review. Ratings come only from completed bookings, so a vendor cannot pad their own score.',
  },
];

/**
 * The light half of the lower page: white, airy, editorial. The dark vendor
 * card that follows is the contrast beat, which is why this section stays
 * deliberately plain — one surface, one grid, no cards.
 */
const HowItWorks = () => (
  <section className="border-t border-line bg-surface py-[clamp(4rem,7vw,7rem)]">
    <div className="shell">
      <header className="max-w-2xl">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-700">
          How it works
        </p>
        <h2 className="mt-3 text-display-sm text-ink">Three simple steps</h2>
        <p className="mt-3.5 text-[1.0625rem] leading-relaxed text-muted">
          From search to celebration — get the people who make it happen.
        </p>
      </header>

      <ol className="mt-[clamp(2.75rem,5vw,4.5rem)] grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                <step.icon className="h-[1.375rem] w-[1.375rem]" aria-hidden="true" />
              </span>
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Step {index + 1}
              </span>

              {/*
                The rule that ties the three steps into one sequence. A flex
                sibling rather than an absolute overlay, so it always begins
                after the label instead of running behind it, and the negative
                margin carries it across the column gap. Never after the last
                step, and never on mobile — where the steps stack, a horizontal
                rule would point at nothing.
              */}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="hidden h-px flex-1 bg-gradient-to-r from-line to-transparent md:-mr-10 md:block"
                />
              )}
            </div>

            <h3 className="mt-6 text-[1.1875rem] font-semibold text-ink">{step.title}</h3>
            <p className="mt-2.5 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export default HowItWorks;
