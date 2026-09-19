import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import type { FilterOptions } from '../types/database';

/**
 * Filter controls. Every change writes to the URL, which drives the query — so
 * filters are applied by Postgres, never by filtering a fetched array.
 *
 * On mobile the panel collapses behind a toggle so it does not push results
 * below the fold; on md and up it is always visible.
 */
const RATING_CHOICES = [
  { value: '', label: 'Any rating' },
  { value: '4.8', label: '4.8+' },
  { value: '4.5', label: '4.5+' },
  { value: '4.0', label: '4.0+' },
];

const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Props {
  options: FilterOptions | null;
  category?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  service?: string;
  activeFilterCount: number;
  onChange: (patch: Record<string, string | number | undefined>) => void;
  onClear: () => void;
  /** Hidden when the page itself already fixes the category. */
  showCategory?: boolean;
}

const MarketplaceFilters = ({
  options,
  category,
  location,
  minPrice,
  maxPrice,
  minRating,
  service,
  activeFilterCount,
  onChange,
  onClear,
  showCategory = true,
}: Props) => {
  const [open, setOpen] = useState(false);

  const field =
    'h-10 w-full rounded-control border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-brand-500';
  const labelStyle = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted';

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="marketplace-filters"
        className="mb-4 flex w-full items-center justify-between rounded-control border border-line-strong bg-surface p-3 text-sm font-medium text-ink-soft md:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">
              {activeFilterCount}
            </span>
          )}
        </span>
        <span className="text-brand-700">{open ? 'Hide' : 'Show'}</span>
      </button>

      <div
        id="marketplace-filters"
        className={`rounded-card border border-line bg-surface p-4 ${open ? 'block' : 'hidden'} md:block`}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {showCategory && (
            <div>
              <label htmlFor="filter-category" className={labelStyle}>
                Category
              </label>
              <select
                id="filter-category"
                className={field}
                value={category ?? ''}
                onChange={(e) => onChange({ category: e.target.value || undefined })}
              >
                <option value="">All categories</option>
                {options?.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="filter-location" className={labelStyle}>
              Location
            </label>
            <select
              id="filter-location"
              className={field}
              value={location ?? ''}
              onChange={(e) => onChange({ location: e.target.value || undefined })}
            >
              <option value="">All locations</option>
              {options?.locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-min-price" className={labelStyle}>
              Min price
            </label>
            <input
              id="filter-min-price"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={options ? formatRupees(options.min_price) : '0'}
              className={field}
              value={minPrice ?? ''}
              onChange={(e) => onChange({ minPrice: e.target.value || undefined })}
            />
          </div>

          <div>
            <label htmlFor="filter-max-price" className={labelStyle}>
              Max price
            </label>
            <input
              id="filter-max-price"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={options ? formatRupees(options.max_price) : 'Any'}
              className={field}
              value={maxPrice ?? ''}
              onChange={(e) => onChange({ maxPrice: e.target.value || undefined })}
            />
          </div>

          <div>
            <label htmlFor="filter-rating" className={labelStyle}>
              Rating
            </label>
            <select
              id="filter-rating"
              className={field}
              value={minRating ?? ''}
              onChange={(e) => onChange({ minRating: e.target.value || undefined })}
            >
              {RATING_CHOICES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="filter-service" className={labelStyle}>
              Service
            </label>
            <input
              id="filter-service"
              type="search"
              placeholder="e.g. drone photography, live counters"
              className={field}
              defaultValue={service ?? ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange({ service: (e.target as HTMLInputElement).value || undefined });
                }
              }}
              onBlur={(e) => onChange({ service: e.target.value || undefined })}
            />
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-10 items-center gap-1 self-start rounded-control border border-line-strong px-4 text-sm text-ink-soft transition-colors hover:bg-canvas sm:self-auto"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketplaceFilters;
