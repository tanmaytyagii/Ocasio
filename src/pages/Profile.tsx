import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Heart, User as UserIcon, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { getCustomerBookings } from '../services/bookings';
import { updateMyProfile } from '../services/profiles';
import { usePageMeta } from '../hooks/usePageMeta';
import BookingStatusBadge from '../components/BookingStatusBadge';
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Panel,
  TextField,
} from '../components/ui';
import type { BookingWithDetails } from '../types/database';

/**
 * Customer dashboard.
 *
 * Every figure here is counted from rows the signed-in user actually owns.
 * This page previously showed invented numbers — "3 pending confirmations,
 * 8 vendors contacted, 2 upcoming meetings" — alongside a hardcoded calendar
 * and an activity feed naming vendors the user had never dealt with. Real
 * bookings and favourites have existed since Phase 3, so those numbers were
 * simply wrong.
 *
 * Removed rather than restyled: the calendar (there is no availability or
 * scheduling system) and the notifications tab (nothing sends notifications).
 * Settings stays because updating your display name is real, RLS-protected
 * functionality.
 */
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const Stat = ({ label, value, to }: { label: string; value: string | number; to?: string }) => {
  const body = (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-card transition-shadow hover:shadow-card-hover">
      {body}
    </Link>
  ) : (
    body
  );
};

const Profile = () => {
  usePageMeta('Your dashboard — Ocasio');

  const { user, profile, role, refreshProfile } = useAuth();
  const { favoriteIds } = useFavorites();
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get('tab');
  const activeTab: TabId = requested === 'settings' ? 'settings' : 'overview';

  const [bookings, setBookings] = useState<BookingWithDetails[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await getCustomerBookings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateMyProfile({ full_name: fullName.trim() || null });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  // Counted from real rows, not stored anywhere.
  const active = (bookings ?? []).filter((b) => b.status === 'pending' || b.status === 'accepted');
  const completed = (bookings ?? []).filter((b) => b.status === 'completed');
  const recent = (bookings ?? []).slice(0, 4);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-display-sm text-ink">
            {profile?.full_name ? `Welcome back, ${profile.full_name}` : 'Your dashboard'}
          </h1>
          <p className="mt-2 text-muted">
            {user?.email}
            {role && <span className="capitalize"> · {role} account</span>}
          </p>
        </header>

        <nav className="mb-8 flex gap-1 border-b border-line" aria-label="Dashboard sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setSearchParams(tab.id === 'overview' ? {} : { tab: tab.id })}
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
              <Stat label="Active bookings" value={loading ? '—' : active.length} to="/bookings" />
              <Stat label="Completed" value={loading ? '—' : completed.length} to="/bookings" />
              <Stat
                label="All requests"
                value={loading ? '—' : (bookings?.length ?? 0)}
                to="/bookings"
              />
              <Stat label="Saved vendors" value={favoriteIds.size} to="/favorites" />
            </div>

            <Panel
              title="Recent bookings"
              action={
                bookings && bookings.length > 0 ? (
                  <Link to="/bookings" className="text-sm font-medium text-brand-700 hover:underline">
                    View all
                  </Link>
                ) : undefined
              }
            >
              {loading && <ListSkeleton count={2} />}
              {error && !loading && <ErrorState message={error} onRetry={load} />}

              {!loading && !error && recent.length === 0 && (
                <EmptyState
                  title="No bookings yet"
                  description="Find a vendor and send a booking request. It will show up here so you can track it."
                  icon={CalendarDays}
                  action={<ButtonLink to="/vendors">Browse vendors</ButtonLink>}
                />
              )}

              {!loading && !error && recent.length > 0 && (
                <ul className="divide-y divide-line">
                  {recent.map((booking) => (
                    <li key={booking.id}>
                      <Link
                        to={`/bookings/${booking.id}`}
                        className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {booking.vendors?.business_name ?? 'Vendor'}
                          </p>
                          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                            <span className="truncate">{booking.vendor_services?.name}</span>
                            <span aria-hidden="true">·</span>
                            <span className="whitespace-nowrap">
                              {formatDate(booking.event_date)}
                            </span>
                          </p>
                        </div>
                        <BookingStatusBadge status={booking.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <Heart className="h-5 w-5 text-brand-700" aria-hidden="true" />
                <h2 className="mt-3 font-semibold text-ink">Saved vendors</h2>
                <p className="mt-1 text-sm text-muted">
                  Shortlist vendors while browsing and compare them later.
                </p>
                <ButtonLink to="/favorites" variant="secondary" size="sm" className="mt-4">
                  Open saved vendors
                </ButtonLink>
              </Card>

              <Card className="p-6">
                <MapPin className="h-5 w-5 text-brand-700" aria-hidden="true" />
                <h2 className="mt-3 font-semibold text-ink">Find someone new</h2>
                <p className="mt-1 text-sm text-muted">
                  Search venues, catering, photography and decoration across India.
                </p>
                <ButtonLink to="/vendors" variant="secondary" size="sm" className="mt-4">
                  Explore vendors
                </ButtonLink>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <Panel title="Account">
            <form onSubmit={handleSave} className="max-w-md space-y-5">
              <TextField
                label="Display name"
                value={fullName}
                maxLength={120}
                onChange={(e) => setFullName(e.target.value)}
                hint="Shown to you only. Reviews you leave are published without a name."
              />

              <div>
                <p className="mb-1.5 block text-sm font-medium text-ink-soft">Email</p>
                <p className="flex h-11 items-center rounded-control border border-line bg-canvas px-3 text-sm text-muted">
                  {user?.email}
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  Changing your email address is not supported yet.
                </p>
              </div>

              {saveError && (
                <p className="text-sm text-red-700" role="alert">
                  {saveError}
                </p>
              )}
              {saved && !saveError && (
                <p className="text-sm text-green-700" role="status">
                  Profile saved.
                </p>
              )}

              <Button type="submit" loading={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </form>

            <div className="mt-8 border-t border-line pt-6">
              <h3 className="flex items-center gap-2 font-medium text-ink">
                <UserIcon className="h-4 w-4 text-muted" aria-hidden="true" />
                Account type
              </h3>
              <p className="mt-1 text-sm capitalize text-muted">{role ?? 'customer'}</p>
              {role !== 'vendor' && (
                <p className="mt-2 text-sm text-muted">
                  Run an events business?{' '}
                  <Link to="/become-vendor" className="font-medium text-brand-700 hover:underline">
                    Apply to list it
                  </Link>
                  .
                </p>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};

export default Profile;
