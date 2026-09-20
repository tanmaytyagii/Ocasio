import { useEffect, useState } from 'react';
import { updateMyVendor } from '../../services/vendorWorkspace';
import { getFilterOptions } from '../../services/vendors';
import { Button, Panel, SelectField, TextAreaField, TextField } from '../ui';
import type { FilterOptions, PublicVendor } from '../../types/database';

/**
 * The vendor's own profile.
 *
 * Read-only until Edit is pressed, because the common case is checking what
 * customers see rather than changing it, and a page of live inputs invites
 * accidental edits.
 *
 * The fields here are exactly the ones the database lets an owner change.
 * Status, rating and ownership are refused by protect_vendor_moderated_fields()
 * and are shown as read-only facts rather than offered as controls that would
 * fail on save.
 */
const MAX = { name: 160, description: 2000, phone: 32, email: 160, website: 200, hours: 120 };

interface Props {
  vendor: PublicVendor;
  onSaved: (vendor: PublicVendor) => void;
}

const VendorProfilePanel = ({ vendor, onSaved }: Props) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const initial = {
    business_name: vendor.business_name,
    description: vendor.description ?? '',
    category: vendor.category,
    location: vendor.location,
    phone: vendor.phone ?? '',
    email: vendor.email ?? '',
    website: vendor.website ?? '',
    business_hours: vendor.business_hours ?? '',
    starting_price: vendor.starting_price === null ? '' : String(vendor.starting_price),
  };

  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [vendor.id, vendor.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getFilterOptions()
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some(
    (k) => form[k] !== initial[k],
  );

  const validate = () => {
    const errors: Record<string, string> = {};
    const name = form.business_name.trim();

    if (name.length < 2 || name.length > MAX.name) {
      errors.business_name = 'Business name must be between 2 and 160 characters.';
    }
    if (!form.category) errors.category = 'Choose a category.';
    if (!form.location.trim()) errors.location = 'Enter the city you work in.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (form.starting_price.trim()) {
      const n = Number(form.starting_price);
      if (!Number.isFinite(n) || n < 0) errors.starting_price = 'Enter a number, or leave it blank.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !validate()) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await updateMyVendor(vendor.id, {
        business_name: form.business_name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        location: form.location.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        business_hours: form.business_hours.trim() || null,
        starting_price: form.starting_price.trim() ? Number(form.starting_price) : null,
      });
      onSaved(updated);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    setForm(initial);
    setFieldErrors({});
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    const rows: [string, string][] = [
      ['Category', vendor.category],
      ['City', vendor.location],
      ['Starting price', vendor.starting_price === null ? 'Not set' : `₹${vendor.starting_price.toLocaleString('en-IN')}`],
      ['Phone', vendor.phone ?? 'Not set'],
      ['Email', vendor.email ?? 'Not set'],
      ['Website', vendor.website ?? 'Not set'],
      ['Business hours', vendor.business_hours ?? 'Not set'],
    ];

    return (
      <Panel
        title="Profile"
        action={
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        }
      >
        {saved && (
          <p role="status" className="mb-5 rounded-control border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
            Profile saved.
          </p>
        )}

        <h3 className="text-[1.1875rem] font-semibold text-ink">{vendor.business_name}</h3>
        <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-muted">
          {vendor.description || 'No description yet. Customers see this on your listing.'}
        </p>

        <dl className="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-sm text-ink-soft">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    );
  }

  return (
    <Panel title="Edit profile">
      <form onSubmit={save} noValidate className="space-y-5">
        <TextField
          label="Business name"
          required
          value={form.business_name}
          maxLength={MAX.name}
          error={fieldErrors.business_name}
          onChange={(e) => set('business_name', e.target.value)}
        />

        <TextAreaField
          label="Description"
          rows={4}
          value={form.description}
          maxLength={MAX.description}
          hint="Shown on your public listing."
          onChange={(e) => set('description', e.target.value)}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Category"
            required
            value={form.category}
            error={fieldErrors.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {(options?.categories ?? [vendor.category]).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>

          <TextField
            label="City"
            required
            value={form.location}
            error={fieldErrors.location}
            onChange={(e) => set('location', e.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Starting price (₹)"
            type="number"
            min={0}
            value={form.starting_price}
            error={fieldErrors.starting_price}
            hint="Used when a service has no price of its own."
            onChange={(e) => set('starting_price', e.target.value)}
          />
          <TextField
            label="Business hours"
            value={form.business_hours}
            maxLength={MAX.hours}
            hint="e.g. 10:00 AM – 8:00 PM"
            onChange={(e) => set('business_hours', e.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Phone"
            type="tel"
            value={form.phone}
            maxLength={MAX.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            maxLength={MAX.email}
            error={fieldErrors.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>

        <TextField
          label="Website"
          value={form.website}
          maxLength={MAX.website}
          onChange={(e) => set('website', e.target.value)}
        />

        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Panel>
  );
};

export default VendorProfilePanel;
