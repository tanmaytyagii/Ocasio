import { Link } from 'react-router-dom';

/**
 * Site footer — the page's closing surface.
 *
 * Every entry links to a route that exists (checked against the route table in
 * App.tsx). There are no social icons, no Privacy / Terms / Sitemap row, no
 * newsletter box and no trust badges, because none of those exist. A footer
 * full of links that go nowhere is the opposite of premium.
 *
 * The city links carry `location`, which is the parameter the marketplace
 * actually reads (useMarketplaceParams), and all five have active vendors
 * behind them in the catalogue.
 *
 * Composition notes:
 *  - The content is bounded to 84rem and centred inside the page shell. The cap
 *    is chosen so the two things that matter agree rather than compete: the
 *    shell is 1190px at 1280 and 1339px at 1440, both under the cap, so the
 *    footer is simply the shell there and its left edge lands on the same line
 *    as the header wordmark. From 1600 up the shell outgrows the cap, the
 *    footer stops widening and centres — which, because the shell is itself
 *    centred, puts it exactly in the middle of the viewport at 1920 and 2560
 *    instead of leaving 500px of dead space on one side.
 *  - The brand column is given 1.3fr against the navigation's 1fr so it reads
 *    as the anchor rather than as a fourth column of the same weight.
 */
const COLUMNS = [
  {
    heading: 'Explore',
    links: [
      { label: 'All vendors', to: '/vendors' },
      { label: 'Venues', to: '/category/venues' },
      { label: 'Catering', to: '/category/catering' },
      { label: 'Photography', to: '/category/photography' },
      { label: 'Decoration', to: '/category/decoration' },
    ],
  },
  {
    heading: 'Popular cities',
    links: [
      { label: 'Mumbai', to: '/search?location=Mumbai' },
      { label: 'Delhi', to: '/search?location=Delhi' },
      { label: 'Bangalore', to: '/search?location=Bangalore' },
      { label: 'Chennai', to: '/search?location=Chennai' },
      { label: 'Hyderabad', to: '/search?location=Hyderabad' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About us', to: '/about' },
      { label: 'Contact', to: '/contact' },
      { label: 'Blog', to: '/blog' },
      { label: 'List your business', to: '/become-vendor' },
    ],
  },
];

const slug = (s: string) => `footer-${s.toLowerCase().replace(/\s+/g, '-')}`;

/**
 * An abstract mark in the same geometry the About page illustrations use:
 * a ring, a rounded form and a line resolving to a point. Decorative only, so
 * it is hidden from assistive technology.
 */
const BrandMark = () => (
  <svg
    viewBox="0 0 132 36"
    aria-hidden="true"
    className="mt-7 h-7 w-auto text-brand-200 sm:h-8"
  >
    <circle cx="18" cy="18" r="14.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="18" cy="18" r="5" className="fill-brand-300" />
    <rect
      x="44"
      y="6"
      width="24"
      height="24"
      rx="8"
      className="fill-brand-50"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="56" cy="18" r="3.5" className="fill-brand-400" />
    <path d="M82 18h32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="126" cy="18" r="4" className="fill-brand-300" />
  </svg>
);

const Footer = () => (
  <footer className="border-t border-line bg-surface">
    <div className="shell pb-[clamp(1.75rem,2.5vw,2.5rem)] pt-[clamp(3rem,4.5vw,4.5rem)]">
      <div className="mx-auto max-w-[84rem]">
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] lg:gap-x-12">
          {/* ── brand ─────────────────────────────────────────────────── */}
          <div className="sm:col-span-2 md:col-span-1">
            <p className="text-[1.75rem] font-semibold tracking-[-0.045em] text-brand-700">
              Ocasio
            </p>

            <p className="mt-4 max-w-[21rem] text-[0.9375rem] leading-[1.7] text-muted">
              Find and book trusted vendors for weddings, corporate events and celebrations across
              India.
            </p>

            {/* Editorial, not a claim: three words for what the marketplace is
                organised around. */}
            <p className="mt-7 flex items-center gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
              Events
              <span className="h-px w-4 bg-brand-300" aria-hidden="true" />
              People
              <span className="h-px w-4 bg-brand-300" aria-hidden="true" />
              Places
            </p>

            <BrandMark />
          </div>

          {/* ── navigation ────────────────────────────────────────────── */}
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-labelledby={slug(column.heading)}>
              <p
                id={slug(column.heading)}
                className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-ink"
              >
                {column.heading}
              </p>

              <ul className="mt-5 space-y-3.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="inline-block text-[0.9375rem] leading-6 text-muted transition-colors duration-200 hover:text-brand-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* ── closing utility row ─────────────────────────────────────── */}
        <div className="mt-[clamp(2.5rem,4vw,3.5rem)] flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-[0.875rem] text-muted">
            © {new Date().getFullYear()} Ocasio. All rights reserved.
          </p>
          {/* Accurate description of the catalogue's status. Stays visible at
              every width rather than being tucked away. */}
          <p className="text-[0.875rem] text-muted">
            Vendor listings in this catalogue are sample data for demonstration.
          </p>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
