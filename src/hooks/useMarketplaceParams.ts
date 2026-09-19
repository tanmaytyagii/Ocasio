import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { VendorSearchParams } from '../services/vendors';
import type { VendorSort } from '../types/database';

/**
 * Marketplace search state, held in the URL rather than React state.
 *
 * This is what makes a search refreshable, shareable, and navigable with the
 * browser's back button. The URL is the single source of truth; nothing is
 * mirrored into component state where the two could disagree.
 *
 *   /search?q=wedding&location=Delhi&category=Photography&maxPrice=80000&sort=rating&page=2
 */
const SORTS: VendorSort[] = ['relevance', 'rating', 'price_asc', 'price_desc', 'reviews'];

export const SORT_LABELS: Record<VendorSort, string> = {
  relevance: 'Relevance',
  rating: 'Highest rated',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  reviews: 'Most reviewed',
};

function readNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export interface MarketplaceParams extends VendorSearchParams {
  sort: VendorSort;
  page: number;
}

export function useMarketplaceParams(overrides: Partial<VendorSearchParams> = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Serialise the overrides so a caller passing an object literal does not
  // retrigger the memo on every render.
  const overrideKey = JSON.stringify(overrides);

  const params = useMemo<MarketplaceParams>(() => {
    const rawSort = searchParams.get('sort') as VendorSort | null;
    const sort = rawSort && SORTS.includes(rawSort) ? rawSort : 'relevance';

    return {
      query: searchParams.get('q') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      location: searchParams.get('location') ?? undefined,
      minPrice: readNumber(searchParams.get('minPrice')),
      maxPrice: readNumber(searchParams.get('maxPrice')),
      minRating: readNumber(searchParams.get('minRating')),
      service: searchParams.get('service') ?? undefined,
      sort,
      page: Math.max(readNumber(searchParams.get('page')) ?? 1, 1),
      ...JSON.parse(overrideKey),
    };
  }, [searchParams, overrideKey]);

  /**
   * Applies a patch to the URL. Changing any filter resets to page 1 — leaving
   * the page number behind is how pagination "breaks when filters change":
   * a narrower result set can have fewer pages than the one you were on.
   */
  const setParams = useCallback(
    (patch: Partial<Record<string, string | number | undefined>>) => {
      const next = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '' || value === null) next.delete(key);
        else next.set(key, String(value));
      }

      if (!('page' in patch)) next.delete('page');

      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams();
    const q = searchParams.get('q');
    if (q) next.set('q', q);
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const activeFilterCount = [
    searchParams.get('category'),
    searchParams.get('location'),
    searchParams.get('minPrice'),
    searchParams.get('maxPrice'),
    searchParams.get('minRating'),
    searchParams.get('service'),
  ].filter(Boolean).length;

  return { params, setParams, clearFilters, activeFilterCount };
}
