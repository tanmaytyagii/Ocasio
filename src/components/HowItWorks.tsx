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

const HowItWorks = () => (
  <section className="border-y border-line bg-surface py-16 sm:py-20">
    <div className="shell">
      <div className="max-w-2xl">
        <h2 className="text-display-sm text-ink">How Ocasio works</h2>
        <p className="mt-3 text-muted">
          Three steps from browsing to a booking you can hold someone to.
        </p>
      </div>

      <ol className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <step.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Step {index + 1}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export default HowItWorks;
