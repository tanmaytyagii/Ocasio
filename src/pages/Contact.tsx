import { Link } from 'react-router-dom';
import { Mail, Store, HelpCircle } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * Contact page.
 *
 * Deliberately has no contact form: a form that posts nowhere would claim a
 * message had been sent when nothing was. Routing enquiries to a real inbox is
 * the honest option until there is somewhere for submissions to go.
 *
 * TODO: replace SUPPORT_EMAIL with Ocasio's real address before launch. It is a
 * placeholder and does not receive mail.
 */
const SUPPORT_EMAIL = 'hello@ocasio.example';

const CONTACT_ROUTES = [
  {
    icon: HelpCircle,
    title: 'General enquiries',
    body: 'Questions about Ocasio, finding a vendor, or how the platform works.',
    action: { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  },
  {
    icon: Store,
    title: 'Listing your business',
    body: 'Run an events business and want to appear on Ocasio? Start with the vendor application.',
    action: { label: 'Become a vendor', to: '/become-vendor' },
  },
];

const Contact = () => {
  usePageMeta(
    'Contact — Ocasio',
    'Get in touch with Ocasio about finding vendors, listing your business, or general enquiries.',
  );

  return (
    <div className="bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-ink mb-4">Contact Ocasio</h1>
          <p className="text-xl text-muted max-w-3xl mx-auto">
            We'd like to hear from you — whether you're planning an occasion or want to list your
            business on the platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 max-w-3xl mx-auto">
          {CONTACT_ROUTES.map(({ icon: Icon, title, body, action }) => (
            <div key={title} className="bg-white rounded-lg shadow-md p-6">
              <div className="w-12 h-12 bg-brand-50 rounded-lg flex items-center justify-center mb-4">
                <Icon className="h-6 w-6 text-brand-700" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-semibold text-ink">{title}</h2>
              <p className="text-muted mt-2">{body}</p>
              <div className="mt-4">
                {action.href ? (
                  <a
                    href={action.href}
                    className="inline-flex items-center text-brand-700 font-medium hover:underline"
                  >
                    <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
                    {action.label}
                  </a>
                ) : (
                  <Link to={action.to!} className="text-brand-700 font-medium hover:underline">
                    {action.label}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-ink mb-4">Response times</h2>
          <p className="text-muted">
            Ocasio is early in development and enquiries are handled by a small team, so replies may
            take a few days. Vendor applications are reviewed before a listing goes live.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Contact;
