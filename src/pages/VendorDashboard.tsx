import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, Clock, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import VendorBookingRequests from '../components/VendorBookingRequests';
import VendorProfilePanel from '../components/vendor/VendorProfilePanel';
import VendorServicesPanel from '../components/vendor/VendorServicesPanel';
import VendorPortfolioPanel from '../components/vendor/VendorPortfolioPanel';
import { getVendorBookingStats, type VendorBookingStats } from '../services/bookings';
import { getMyVendor } from '../services/vendors';
import { usePageMeta } from '../hooks/usePageMeta';
import { Badge, Button, Card, ErrorState, ListSkeleton, Notice, Panel } from '../components/ui';
import type { PublicVendor } from '../types/database';

/**
 * Vendor workspace.
 *
 * A vendor can now run their own listing from here: edit the profile, manage
 * services and prices, and upload portfolio images. Before Phase B every one of
 * those required SQL, which meant an approved vendor was visible in the
 * marketplace and impossible to book.
 *
 * Every figure is counted from bookings this vendor actually owns, scoped by
 * RLS. There is deliberately no revenue tile: no payment has ever been settled
 * against a real provider, so a rupee total would be fabricated. Quoted prices
 * are indicative figures, not income.
 *
 * Removed rather than restyled:
 *   - the messages tab, a hardcoded two-message inbox. No messaging system
 *     exists, so it could only ever have been a prop.
 *   - the business-hours settings form, which wrote to component state and was
 *     lost on refresh.
 *   - the calendar, which showed two hardcoded March-2025 events. There is no
 *     availability model behind it. Dropping it also removes the last use of
 *     react-big-calendar.
 */
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'profile', label: 'Profile' },
  { id: 'services', label: 'Services' },
  { id: 'portfolio', label: 'Portfolio' },
  // Stays "Bookings": the panel's own heading already says "Booking requests",
  // and renaming the tab broke the vendor sign-in helper shared by the
  // bookings, payments and reviews suites for no product gain.
  { id: 'bookings', label: 'Bookings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const StatCard = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock;
}) => (
  <Card className="p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      </div>
      <Icon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
    </div>
  </Card>
);

const VendorDashboard = () => {
  usePageMeta('Vendor dashboard — Ocasio');

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [stats, setStats] = useState<VendorBookingStats | null>(null);

  // Every panel below needs the vendor row, so it is loaded once here and
  // handed down rather than fetched three times.
  const [vendor, setVendor] = useState<PublicVendor | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [vendorError, setVendorError] = useState<string | null>(null);

  const loadVendor = useCallback(async () => {
    setVendorLoading(true);
    setVendorError(null);
    try {
      setVendor(await getMyVendor());
    } catch (e) {
      setVendorError(e instanceof Error ? e.message : 'Could not load your listing.');
    } finally {
      setVendorLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVendor();
  }, [loadVendor]);

  useEffect(() => {
    let active = true;
    getVendorBookingStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch(() => {
        // Tiles read "—" rather than showing a placeholder number.
        if (active) setStats(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const tile = (value: number | undefined) => (value === undefined ? '—' : String(value));

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-display-sm text-ink">Vendor dashboard</h1>
          <p className="mt-2 text-muted">{user?.email}</p>
        </header>

        <nav
          className="mb-8 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Dashboard sections"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-muted hover:text-ink-soft'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {vendorLoading && <ListSkeleton count={3} />}
        {vendorError && !vendorLoading && (
          <ErrorState message={vendorError} onRetry={() => void loadVendor()} />
        )}

        {!vendorLoading && !vendorError && !vendor && (
          <Panel title="No listing yet">
            <p className="text-muted">
              You have the vendor role but no listing on this account. Apply once and it will appear
              here after review.
            </p>
            <div className="mt-5">
              <Link
                to="/become-vendor"
                className="inline-flex h-11 items-center rounded-control bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Apply to list your business
              </Link>
            </div>
          </Panel>
        )}

        {!vendorLoading && !vendorError && vendor && (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="Total bookings" value={tile(stats?.total)} icon={CalendarCheck} />
                  <StatCard label="Pending requests" value={tile(stats?.pending)} icon={Clock} />
                  <StatCard label="Accepted" value={tile(stats?.accepted)} icon={Inbox} />
                  <StatCard label="Completed" value={tile(stats?.completed)} icon={CheckCircle2} />
                </div>

                <Panel title="Your listing">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[1.0625rem] font-semibold text-ink">
                      {vendor.business_name}
                    </p>
                    <Badge
                      tone={
                        vendor.status === 'active'
                          ? 'success'
                          : vendor.status === 'pending'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {vendor.status}
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm text-muted">
                    {vendor.status === 'active'
                      ? 'Your listing is visible in the marketplace.'
                      : vendor.status === 'pending'
                        ? 'Your application is still under review. Nothing is visible to customers yet.'
                        : 'Your listing is not visible in the marketplace at the moment.'}
                  </p>

                  {vendor.status === 'active' && (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        to={`/vendors/${vendor.slug}`}
                        className="inline-flex h-10 items-center rounded-control border border-line-strong px-4 text-sm text-ink-soft transition-colors hover:bg-canvas"
                      >
                        View public listing
                      </Link>
                      <Button variant="secondary" size="sm" onClick={() => setActiveTab('services')}>
                        Manage services
                      </Button>
                    </div>
                  )}
                </Panel>

                <Notice title="What is not built yet">
                  Ocasio does not yet have vendor messaging, an availability calendar, notifications
                  or payouts. Your profile, services, portfolio, bookings, payments and reviews are
                  real and recorded against your account; anything not shown on this dashboard does
                  not exist behind the scenes either.
                </Notice>
              </div>
            )}

            {activeTab === 'profile' && (
              <VendorProfilePanel vendor={vendor} onSaved={setVendor} />
            )}
            {activeTab === 'services' && <VendorServicesPanel vendorId={vendor.id} />}
            {activeTab === 'portfolio' && <VendorPortfolioPanel vendorId={vendor.id} />}
            {activeTab === 'bookings' && <VendorBookingRequests />}
          </>
        )}
      </div>
    </div>
  );
};

export default VendorDashboard;
