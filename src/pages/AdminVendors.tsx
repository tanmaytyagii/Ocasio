import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, ShieldCheck, X } from 'lucide-react';
import { listVendorsForModeration, moderateVendor } from '../services/admin';
import type { ModerationAction, ModerationVendor } from '../services/admin';
import { usePageMeta } from '../hooks/usePageMeta';
import { Badge, Button, EmptyState, ErrorState, ListSkeleton } from '../components/ui';
import type { BadgeTone } from '../components/ui';
import type { VendorStatus } from '../types/database';

/**
 * Vendor moderation console.
 *
 * An operational surface, not a marketing one: dense rows, plain language, and
 * no metrics. There is deliberately no revenue tile, no application-volume
 * chart and no conversion graph — none of those numbers exist, and a moderation
 * queue does not need them to do its job.
 *
 * Authorization is not here. admin_list_vendors() returns an empty set to a
 * non-admin and moderate_vendor() raises 42501, both decided in Postgres from
 * public.profiles. The route guard below is only there so a non-admin sees an
 * explanation instead of an empty screen.
 */
const TABS: { id: VendorStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'active', label: 'Approved' },
  { id: 'suspended', label: 'Rejected / suspended' },
];

const STATUS_TONE: Record<VendorStatus, BadgeTone> = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Actions offered for a vendor in a given state. */
const actionsFor = (status: VendorStatus): { action: ModerationAction; label: string; danger?: boolean }[] => {
  if (status === 'pending') {
    return [
      { action: 'approve', label: 'Approve' },
      { action: 'reject', label: 'Reject', danger: true },
    ];
  }
  if (status === 'active') return [{ action: 'suspend', label: 'Suspend', danger: true }];
  return [{ action: 'reinstate', label: 'Reinstate' }];
};

const AdminVendors = () => {
  usePageMeta('Vendor moderation — Ocasio admin');

  const [tab, setTab] = useState<VendorStatus>('pending');
  const [query, setQuery] = useState('');
  const [vendors, setVendors] = useState<ModerationVendor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<{
    vendor: ModerationVendor;
    action: ModerationAction;
    label: string;
  } | null>(null);
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVendors(await listVendorsForModeration(tab, query));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load vendor applications.');
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const apply = async () => {
    if (!confirming || working) return;
    setWorking(true);
    setActionError(null);
    try {
      await moderateVendor(confirming.vendor.id, confirming.action, note);
      setFlash(`${confirming.vendor.business_name} — ${confirming.label.toLowerCase()}d.`);
      setConfirming(null);
      setNote('');
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'That did not work. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="bg-canvas">
      <div className="shell py-[clamp(2rem,4vw,3.5rem)]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Admin
            </p>
            <h1 className="mt-3 text-display-sm text-ink">Vendor applications</h1>
          </div>

          <div className="relative">
            <label htmlFor="admin-search" className="sr-only">
              Search vendors by name, city or category
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="admin-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, city or category"
              className="h-11 w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 sm:w-72"
            />
          </div>
        </header>

        {flash && (
          <p
            role="status"
            className="mt-6 rounded-control border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            {flash}
          </p>
        )}

        <nav className="mt-8 flex gap-1 border-b border-line" aria-label="Application status">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => {
                setTab(t.id);
                setFlash(null);
              }}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-muted hover:text-ink-soft'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-8">
          {loading && <ListSkeleton count={3} />}
          {error && !loading && <ErrorState message={error} onRetry={() => void load()} />}

          {!loading && !error && vendors?.length === 0 && (
            <EmptyState
              title={query ? 'No vendors match that search' : `Nothing ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}`}
              description={
                query
                  ? 'Try a different name, city or category.'
                  : tab === 'pending'
                    ? 'New applications will appear here as they are submitted.'
                    : 'Nothing in this state yet.'
              }
              icon={ShieldCheck}
            />
          )}

          {!loading && !error && vendors && vendors.length > 0 && (
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {vendors.map((v) => (
                <li key={v.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-[1.0625rem] font-semibold text-ink">
                          {v.business_name}
                        </h2>
                        <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge>
                      </div>

                      <p className="mt-1 text-sm text-muted">
                        {v.category} · {v.location} · applied {formatDate(v.created_at)}
                      </p>

                      {v.description && (
                        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft">
                          {v.description}
                        </p>
                      )}

                      <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                        <div className="flex gap-2">
                          <dt className="text-muted">Owner</dt>
                          <dd className="truncate text-ink-soft">{v.owner_email ?? v.owner_id}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted">Services listed</dt>
                          <dd className="text-ink-soft">{v.service_count}</dd>
                        </div>
                        {v.phone && (
                          <div className="flex gap-2">
                            <dt className="text-muted">Phone</dt>
                            <dd className="text-ink-soft">{v.phone}</dd>
                          </div>
                        )}
                        {v.email && (
                          <div className="flex gap-2">
                            <dt className="text-muted">Email</dt>
                            <dd className="truncate text-ink-soft">{v.email}</dd>
                          </div>
                        )}
                        {v.website && (
                          <div className="flex gap-2">
                            <dt className="text-muted">Website</dt>
                            <dd className="truncate text-ink-soft">{v.website}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {v.status === 'active' && (
                        <Link
                          to={`/vendors/${v.slug}`}
                          className="inline-flex h-10 items-center rounded-control border border-line-strong px-3.5 text-sm text-ink-soft transition-colors hover:bg-canvas"
                        >
                          View listing
                        </Link>
                      )}
                      {actionsFor(v.status).map((a) => (
                        <Button
                          key={a.action}
                          size="sm"
                          variant={a.danger ? 'danger' : 'primary'}
                          onClick={() => {
                            setConfirming({ vendor: v, action: a.action, label: a.label });
                            setNote('');
                            setActionError(null);
                          }}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/*
        Centred at every width, with its own scroll. Anchored to the bottom it
        moved when the note field took focus on a phone — the confirm button
        shifted under the finger already reaching for it. Not animated for the
        same reason: a moving confirmation is a misclick waiting to happen.
      */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-overlay"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="confirm-title" className="text-lg font-semibold text-ink">
                {confirming.label} {confirming.vendor.business_name}?
              </h2>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setConfirming(null)}
                className="-mr-1 -mt-1 rounded-control p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-muted">
              {confirming.action === 'approve' &&
                'The listing becomes visible in the marketplace and can receive booking requests.'}
              {confirming.action === 'reject' &&
                'The application is declined. The listing will not appear in the marketplace.'}
              {confirming.action === 'suspend' &&
                'The listing is removed from the marketplace. Existing bookings are not affected.'}
              {confirming.action === 'reinstate' &&
                'The listing becomes visible in the marketplace again.'}
            </p>

            <div className="mt-5">
              <label htmlFor="moderation-note" className="mb-1.5 block text-sm font-medium text-ink-soft">
                Note <span className="font-normal text-muted">(optional, recorded in the audit log)</span>
              </label>
              <textarea
                id="moderation-note"
                rows={3}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500"
              />
            </div>

            {actionError && (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {actionError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={working}>
                Cancel
              </Button>
              <Button
                variant={confirming.action === 'approve' || confirming.action === 'reinstate' ? 'primary' : 'danger'}
                onClick={() => void apply()}
                loading={working}
              >
                {working ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Working…
                  </>
                ) : (
                  confirming.label
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminVendors;
