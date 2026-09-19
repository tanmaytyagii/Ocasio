import { useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, Clock, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import VendorBookingRequests from '../components/VendorBookingRequests';
import { getVendorBookingStats, type VendorBookingStats } from '../services/bookings';
import { usePageMeta } from '../hooks/usePageMeta';
import { Button, Card, Notice, Panel } from '../components/ui';

/**
 * Vendor workspace.
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

        <nav className="mb-8 flex gap-1 border-b border-line" aria-label="Dashboard sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-muted hover:text-ink-soft'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total bookings" value={tile(stats?.total)} icon={CalendarCheck} />
              <StatCard label="Pending requests" value={tile(stats?.pending)} icon={Clock} />
              <StatCard label="Accepted" value={tile(stats?.accepted)} icon={Inbox} />
              <StatCard label="Completed" value={tile(stats?.completed)} icon={CheckCircle2} />
            </div>

            <Panel
              title="Booking requests"
              action={
                <Button variant="secondary" size="sm" onClick={() => setActiveTab('bookings')}>
                  Review requests
                </Button>
              }
            >
              <p className="text-muted">
                Accept, decline and complete requests from the Bookings tab. Each request shows the
                customer&apos;s notes, the event date and the quoted price.
              </p>
            </Panel>

            <Notice title="What is not built yet">
              Ocasio does not yet have vendor messaging, an availability calendar, notifications or
              payouts. Bookings, payments and reviews are real and recorded against your account;
              anything not shown on this dashboard does not exist behind the scenes either.
            </Notice>
          </div>
        )}

        {activeTab === 'bookings' && <VendorBookingRequests />}
      </div>
    </div>
  );
};

export default VendorDashboard;
