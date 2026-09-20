import { X } from 'lucide-react';
import type { MarketplaceParams } from '../../hooks/useMarketplaceParams';

/**
 * The filters currently narrowing the result set, each removable.
 *
 * Derived from the URL params on every render rather than held in state, so
 * there is exactly one source of truth — a chip cannot disagree with the query
 * that produced the results behind it. Removing one emits the same patch the
 * control that set it would emit.
 */
const formatRupees = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `₹${(n / 1000).toFixed(0)}k`;

type Patch = Record<string, string | number | undefined>;

interface Chip {
  key: string;
  label: string;
  patch: Patch;
}

function buildChips(params: MarketplaceParams, showCategory: boolean): Chip[] {
  const chips: Chip[] = [];

  if (showCategory && params.category) {
    chips.push({ key: 'category', label: params.category, patch: { category: undefined } });
  }
  if (params.location) {
    chips.push({ key: 'location', label: params.location, patch: { location: undefined } });
  }
  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const label =
      params.minPrice !== undefined && params.maxPrice !== undefined
        ? `${formatRupees(params.minPrice)}–${formatRupees(params.maxPrice)}`
        : params.minPrice !== undefined
          ? `From ${formatRupees(params.minPrice)}`
          : `Up to ${formatRupees(params.maxPrice as number)}`;
    chips.push({ key: 'price', label, patch: { minPrice: undefined, maxPrice: undefined } });
  }
  if (params.minRating !== undefined) {
    chips.push({ key: 'rating', label: `${params.minRating}+ rating`, patch: { minRating: undefined } });
  }
  if (params.service) {
    chips.push({ key: 'service', label: params.service, patch: { service: undefined } });
  }

  return chips;
}

const ActiveFilterChips = ({
  params,
  showCategory,
  onRemove,
  onClear,
}: {
  params: MarketplaceParams;
  showCategory: boolean;
  onRemove: (patch: Patch) => void;
  onClear: () => void;
}) => {
  const chips = buildChips(params, showCategory);
  if (chips.length === 0) return null;

  return (
    <ul
      className="flex flex-wrap items-center gap-2"
      aria-label={`${chips.length} active filter${chips.length === 1 ? '' : 's'}`}
    >
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onRemove(chip.patch)}
            aria-label={`Remove filter ${chip.label}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 pl-3 pr-2 text-[0.8125rem] font-medium text-brand-800 transition-colors hover:bg-brand-100"
          >
            <span className="max-w-[12rem] truncate">{chip.label}</span>
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        </li>
      ))}

      <li>
        <button
          type="button"
          onClick={onClear}
          className="rounded-control px-2 py-1 text-[0.8125rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Clear all
        </button>
      </li>
    </ul>
  );
};

export default ActiveFilterChips;
