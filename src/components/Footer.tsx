import { Link } from 'react-router-dom';

/**
 * Site footer.
 *
 * Every entry links to a route that exists. There are no social icons, no
 * Privacy / Terms / Sitemap row and no newsletter box, because none of those
 * exist — a footer full of links that go nowhere is the opposite of premium.
 *
 * The city links carry `location`, which is the parameter the marketplace
 * actually reads (useMarketplaceParams). They previously carried `city`, which
 * nothing reads, so every one of them landed on an unfiltered search.
 *
 * All five cities below have active vendors behind them in the catalogue.
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

const Footer = () => (
  <footer className="border-t border-line bg-surface">
    {/* The same bounded canvas as the header and every homepage section, so the
        wordmark here sits on the line the wordmark above it does. */}
    <div className="shell py-[clamp(3.5rem,6vw,6rem)]">
      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4 lg:gap-x-12">
        <div className="col-span-2 md:col-span-1">
          <p className="text-[1.5rem] font-semibold tracking-[-0.045em] text-brand-700">Ocasio</p>
          <p className="mt-4 max-w-[22rem] text-[0.9375rem] leading-relaxed text-muted">
            Find and book trusted vendors for weddings, corporate events and celebrations across
            India.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-ink">
              {column.heading}
            </h2>
            <ul className="mt-5 space-y-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-[0.9375rem] text-muted transition-colors hover:text-brand-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-[clamp(3rem,5vw,4.5rem)] flex flex-col gap-2.5 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.875rem] text-muted">
          © {new Date().getFullYear()} Ocasio. All rights reserved.
        </p>
        <p className="text-[0.8125rem] text-muted">
          Vendor listings in this catalogue are sample data for demonstration.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
