import { Link } from 'react-router-dom';

/**
 * Site footer. Only links to routes that exist — every entry here is checked
 * against the route table by a test in the E2E suite.
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
      { label: 'Mumbai', to: '/search?city=Mumbai' },
      { label: 'Delhi', to: '/search?city=Delhi' },
      { label: 'Bangalore', to: '/search?city=Bangalore' },
      { label: 'Chennai', to: '/search?city=Chennai' },
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
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <p className="text-xl font-semibold tracking-tight text-brand-700">Ocasio</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Find and book trusted vendors for weddings, corporate events and celebrations across
            India.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h2 className="text-sm font-semibold text-ink">{column.heading}</h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted transition-colors hover:text-brand-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} Ocasio. All rights reserved.
        </p>
        <p className="text-xs text-muted">
          Vendor listings in this catalogue are sample data for demonstration.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
