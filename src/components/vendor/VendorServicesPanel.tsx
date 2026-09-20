import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  createService,
  deleteService,
  listMyServices,
  updateService,
} from '../../services/vendorWorkspace';
import { Badge, Button, EmptyState, ErrorState, ListSkeleton, Notice, Panel, TextAreaField, TextField } from '../ui';
import type { VendorService } from '../../types/database';

/**
 * The vendor's service list — the thing that decides whether they can be booked
 * at all. BookingRequestForm filters on is_active, so a vendor with no active
 * service is visible in the marketplace and unbookable, which is the gap this
 * closes.
 *
 * A service is never deleted silently when it has history: the database refuses
 * it (ON DELETE RESTRICT from bookings), and the message says to deactivate
 * instead. Deactivating removes it from the customer's choices and leaves every
 * existing booking exactly as it was.
 */
const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Draft {
  id: string | null;
  name: string;
  description: string;
  price: string;
}

const emptyDraft: Draft = { id: null, name: '', description: '', price: '' };

const VendorServicesPanel = ({ vendorId }: { vendorId: string }) => {
  const [services, setServices] = useState<VendorService[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServices(await listMyServices(vendorId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your services.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const validate = (d: Draft) => {
    const errors: Record<string, string> = {};
    if (d.name.trim().length < 1 || d.name.trim().length > 160) {
      errors.name = 'Enter a service name (1–160 characters).';
    }
    if (d.price.trim()) {
      const n = Number(d.price);
      if (!Number.isFinite(n) || n < 0) errors.price = 'Enter a number, or leave it blank.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || saving || !validate(draft)) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        price: draft.price.trim() ? Number(draft.price) : null,
      };

      if (draft.id) {
        await updateService(draft.id, payload);
      } else {
        await createService(vendorId, { ...payload, is_active: true }, services?.length ?? 0);
      }

      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save that service.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (service: VendorService) => {
    setBusyId(service.id);
    setRowError(null);
    try {
      await updateService(service.id, { is_active: !service.is_active });
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not change that service.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (service: VendorService) => {
    if (!window.confirm(`Delete “${service.name}”? This cannot be undone.`)) return;
    setBusyId(service.id);
    setRowError(null);
    try {
      await deleteService(service.id);
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not delete that service.');
    } finally {
      setBusyId(null);
    }
  };

  const active = (services ?? []).filter((s) => s.is_active);
  const inactive = (services ?? []).filter((s) => !s.is_active);

  const Row = ({ service }: { service: VendorService }) => (
    <li className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="font-medium text-ink">{service.name}</p>
          {!service.is_active && <Badge tone="neutral">Inactive</Badge>}
        </div>
        {service.description && (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">{service.description}</p>
        )}
        <p className="mt-1.5 text-sm text-ink-soft">
          {service.price === null ? 'No price set' : formatRupees(service.price)}
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busyId === service.id}
          onClick={() =>
            setDraft({
              id: service.id,
              name: service.name,
              description: service.description ?? '',
              price: service.price === null ? '' : String(service.price),
            })
          }
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={busyId === service.id}
          onClick={() => void toggle(service)}
        >
          {service.is_active ? 'Deactivate' : 'Activate'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busyId === service.id}
          onClick={() => void remove(service)}
        >
          Delete
        </Button>
      </div>
    </li>
  );

  return (
    <Panel
      title="Services"
      action={
        !draft && (
          <Button size="sm" onClick={() => setDraft(emptyDraft)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add service
          </Button>
        )
      }
    >
      {loading && <ListSkeleton count={2} />}
      {error && !loading && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && (
        <>
          {active.length === 0 && (
            <div className="mb-6">
              <Notice title="Customers cannot book you yet">
                A booking request is made against a service. Add at least one active service, with
                a price, and your listing becomes bookable.
              </Notice>
            </div>
          )}

          {rowError && (
            <p className="mb-5 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {rowError}
            </p>
          )}

          {draft && (
            <form
              onSubmit={submit}
              noValidate
              className="mb-6 space-y-4 rounded-card border border-line bg-canvas p-5"
            >
              <h3 className="text-sm font-semibold text-ink">
                {draft.id ? 'Edit service' : 'New service'}
              </h3>

              <TextField
                label="Service name"
                required
                value={draft.name}
                maxLength={160}
                error={fieldErrors.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />

              <TextAreaField
                label="Description"
                rows={2}
                value={draft.description}
                hint="What the customer gets. Optional."
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />

              <TextField
                label="Price (₹)"
                type="number"
                min={0}
                value={draft.price}
                error={fieldErrors.price}
                hint="Leave blank to use your starting price."
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              />

              {formError && (
                <p className="text-sm text-red-700" role="alert">
                  {formError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setDraft(null);
                    setFieldErrors({});
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={saving}>
                  {draft.id ? 'Save service' : 'Add service'}
                </Button>
              </div>
            </form>
          )}

          {services?.length === 0 && !draft && (
            <EmptyState
              title="No services yet"
              description="Add the things customers can book — a package, a session, a day rate."
              action={<Button onClick={() => setDraft(emptyDraft)}>Add your first service</Button>}
            />
          )}

          {active.length > 0 && (
            <section aria-labelledby="active-services">
              <h3 id="active-services" className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Active
              </h3>
              <ul className="mt-3 divide-y divide-line">
                {active.map((s) => (
                  <Row key={s.id} service={s} />
                ))}
              </ul>
            </section>
          )}

          {inactive.length > 0 && (
            <section aria-labelledby="inactive-services" className="mt-8">
              <h3 id="inactive-services" className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Inactive
              </h3>
              <p className="mt-1 text-sm text-muted">
                Hidden from customers. Existing bookings are unaffected.
              </p>
              <ul className="mt-3 divide-y divide-line">
                {inactive.map((s) => (
                  <Row key={s.id} service={s} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Panel>
  );
};

export default VendorServicesPanel;
