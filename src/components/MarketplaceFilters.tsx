import { useState } from 'react';
import { SlidersHorizontal, Star, Check } from 'lucide-react';
import FilterPopover from './marketplace/FilterPopover';
import type { CategoryCount, FilterOptions } from '../types/database';

/**
 * The marketplace facet toolbar.
 *
 * Every change writes to the URL, which drives the query — filters are applied
 * by Postgres via search_vendors(), never by filtering a fetched array. This
 * file only changed how the controls look and behave; the patches it emits are
 * the same keys the URL always carried.
 *
 * It replaced five native selects and two number inputs sitting in one bordered
 * card. The controls now state their own value, so the toolbar reads as the
 * current scope rather than as an empty form.
 */
const RATING_CHOICES = [
  { value: '', label: 'Any rating' },
  { value: '4.8', label: '4.8+' },
  { value: '4.5', label: '4.5+' },
  { value: '4.0', label: '4.0+' },
];

const formatRupees = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `₹${(n / 1000).toFixed(0)}k`;

type Patch = Record<string, string | number | undefined>;

interface Props {
  options: FilterOptions | null;
  categoryCounts: CategoryCount[];
  category?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  service?: string;
  activeFilterCount: number;
  onChange: (patch: Patch) => void;
  onClear: () => void;
  /** Hidden when the page itself already fixes the category. */
  showCategory?: boolean;
}

/** A searchable option list, shared by Category and Location. */
const OptionList = ({
  values,
  selected,
  allLabel,
  searchLabel,
  counts,
  onPick,
}: {
  values: string[];
  selected?: string;
  allLabel: string;
  searchLabel: string;
  counts?: Map<string, number>;
  onPick: (value: string | undefined) => void;
}) => {
  const [term, setTerm] = useState('');
  const shown = term.trim()
    ? values.filter((v) => v.toLowerCase().includes(term.trim().toLowerCase()))
    : values;

  return (
    <div>
      {values.length > 6 && (
        <>
          <label htmlFor={`q-${searchLabel}`} className="sr-only">
            {searchLabel}
          </label>
          <input
            id={`q-${searchLabel}`}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={searchLabel}
            className="mb-2 h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand-500"
          />
        </>
      )}

      <ul className="max-h-64 overflow-y-auto" role="listbox" aria-label={searchLabel}>
        <li>
          <button
            type="button"
            role="option"
            aria-selected={!selected}
            onClick={() => onPick(undefined)}
            className="flex w-full items-center justify-between rounded-control px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-canvas"
          >
            {allLabel}
            {!selected && <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />}
          </button>
        </li>

        {shown.map((value) => {
          const isSelected = selected === value;
          return (
            <li key={value}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onPick(value)}
                className="flex w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-canvas"
              >
                <span className="truncate">{value}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {counts?.has(value) && (
                    <span className="text-xs text-muted">{counts.get(value)}</span>
                  )}
                  {isSelected && <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />}
                </span>
              </button>
            </li>
          );
        })}

        {shown.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted">No matches</li>
        )}
      </ul>
    </div>
  );
};

const MarketplaceFilters = ({
  options,
  categoryCounts,
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
  const counts = new Map(categoryCounts.map((c) => [c.category, c.vendor_count]));

  const priceSummary =
    minPrice !== undefined && maxPrice !== undefined
      ? `${formatRupees(minPrice)}–${formatRupees(maxPrice)}`
      : minPrice !== undefined
        ? `From ${formatRupees(minPrice)}`
        : maxPrice !== undefined
          ? `Up to ${formatRupees(maxPrice)}`
          : 'Price';

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {showCategory && (
        <FilterPopover label="Category" summary={category ?? ''} active={Boolean(category)}>
          {(close) => (
            <OptionList
              values={options?.categories ?? []}
              selected={category}
              allLabel="All categories"
              searchLabel="Search categories"
              counts={counts}
              onPick={(v) => {
                onChange({ category: v });
                close();
              }}
            />
          )}
        </FilterPopover>
      )}

      <FilterPopover label="Location" summary={location ?? ''} active={Boolean(location)}>
        {(close) => (
          <OptionList
            values={options?.locations ?? []}
            selected={location}
            allLabel="All locations"
            searchLabel="Search locations"
            onPick={(v) => {
              onChange({ location: v });
              close();
            }}
          />
        )}
      </FilterPopover>

      <FilterPopover
        label="Price"
        summary={priceSummary}
        active={minPrice !== undefined || maxPrice !== undefined}
        panelWidth="sm:w-80"
      >
        {(close) => (
          <PricePanel
            options={options}
            minPrice={minPrice}
            maxPrice={maxPrice}
            onApply={(patch) => {
              onChange(patch);
              close();
            }}
          />
        )}
      </FilterPopover>

      <FilterPopover
        label="Rating"
        summary={minRating !== undefined ? `${minRating}+` : ''}
        active={minRating !== undefined}
        panelWidth="sm:w-60"
      >
        {(close) => (
          <fieldset>
            <legend className="sr-only">Minimum rating</legend>
            {RATING_CHOICES.map((r) => {
              const checked = (minRating !== undefined ? String(minRating) : '') === r.value;
              return (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                >
                  <input
                    type="radio"
                    name="min-rating"
                    value={r.value}
                    checked={checked}
                    onChange={() => {
                      onChange({ minRating: r.value || undefined });
                      close();
                    }}
                    className="h-4 w-4 border-line-strong text-brand-600 focus:ring-brand-500"
                  />
                  <span className="flex items-center gap-1.5">
                    {r.value && (
                      <Star className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-hidden="true" />
                    )}
                    {r.label}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
      </FilterPopover>

      <FilterPopover
        label="More filters"
        summary={service ? `Service: ${service}` : ''}
        active={Boolean(service)}
        align="end"
        panelWidth="sm:w-80"
        icon={<SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />}
      >
        {(close) => (
          <MorePanel
            service={service}
            activeFilterCount={activeFilterCount}
            onApply={(patch) => {
              onChange(patch);
              close();
            }}
            onClear={() => {
              onClear();
              close();
            }}
          />
        )}
      </FilterPopover>
    </div>
  );
};

/** Numeric bounds rather than a slider: the real range spans two orders of
 *  magnitude, where a drag resolves to thousands of rupees per pixel. */
const PricePanel = ({
  options,
  minPrice,
  maxPrice,
  onApply,
}: {
  options: FilterOptions | null;
  minPrice?: number;
  maxPrice?: number;
  onApply: (patch: Patch) => void;
}) => {
  const [lo, setLo] = useState(minPrice !== undefined ? String(minPrice) : '');
  const [hi, setHi] = useState(maxPrice !== undefined ? String(maxPrice) : '');

  const field =
    'h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand-500';

  return (
    <div>
      {options && (
        <p className="mb-3 text-xs text-muted">
          Vendors start between ₹{options.min_price.toLocaleString('en-IN')} and ₹
          {options.max_price.toLocaleString('en-IN')}
        </p>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="price-min" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Minimum
          </label>
          <input
            id="price-min"
            type="number"
            inputMode="numeric"
            min={0}
            value={lo}
            onChange={(e) => setLo(e.target.value)}
            placeholder={options ? String(options.min_price) : '0'}
            className={field}
          />
        </div>
        <span className="pb-2.5 text-muted" aria-hidden="true">
          –
        </span>
        <div className="flex-1">
          <label htmlFor="price-max" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Maximum
          </label>
          <input
            id="price-max"
            type="number"
            inputMode="numeric"
            min={0}
            value={hi}
            onChange={(e) => setHi(e.target.value)}
            placeholder={options ? String(options.max_price) : 'Any'}
            className={field}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={() => onApply({ minPrice: undefined, maxPrice: undefined })}
          className="rounded-control px-2 py-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onApply({ minPrice: lo || undefined, maxPrice: hi || undefined })}
          className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Apply
        </button>
      </div>
    </div>
  );
};

/** Service is a free-text match against vendor_services, so it stays an input
 *  rather than a list — nothing exposes the distinct service names. */
const MorePanel = ({
  service,
  activeFilterCount,
  onApply,
  onClear,
}: {
  service?: string;
  activeFilterCount: number;
  onApply: (patch: Patch) => void;
  onClear: () => void;
}) => {
  const [value, setValue] = useState(service ?? '');

  return (
    <div>
      <label htmlFor="filter-service" className="mb-1.5 block text-xs font-medium text-ink-soft">
        Service
      </label>
      <input
        id="filter-service"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onApply({ service: value || undefined });
        }}
        placeholder="e.g. drone photography, live counters"
        className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand-500"
      />
      <p className="mt-2 text-xs text-muted">
        Matches the services a vendor lists, not just their description.
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={onClear}
          disabled={activeFilterCount === 0}
          className="rounded-control px-2 py-1.5 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={() => onApply({ service: value || undefined })}
          className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Apply filters
        </button>
      </div>
    </div>
  );
};

export default MarketplaceFilters;
