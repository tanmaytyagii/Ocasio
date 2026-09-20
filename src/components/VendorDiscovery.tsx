import { useCallback, useEffect, useMemo, useState } from 'react';
import { searchVendors, getFilterOptions, getCategoryCounts } from '../services/vendors';
import type { VendorSearchResponse } from '../services/vendors';
import type { CategoryCount, FilterOptions, VendorSort } from '../types/database';
import { useMarketplaceParams, SORT_LABELS } from '../hooks/useMarketplaceParams';
import VendorCard from './VendorCard';
import MarketplaceFilters from './MarketplaceFilters';
import MarketplaceSearch from './marketplace/MarketplaceSearch';
import ActiveFilterChips from './marketplace/ActiveFilterChips';
import Pagination from './Pagination';
import { VendorGridSkeleton, ErrorState, EmptyState, Button, ButtonLink } from './ui';

/**
 * The marketplace discovery surface, shared by /vendors, /search and
 * /category/:slug. They differ only in heading and whether the category is
 * fixed, so they are the same component rather than three near-copies.
 *
 * All state lives in the URL (see useMarketplaceParams), so a result set can be
 * refreshed, shared and navigated with browser back/forward. Filtering,
 * sorting and pagination all happen in Postgres via search_vendors(); this file
 * composes controls around that, and does not filter anything itself.
 */
const PAGE_SIZE = 12;

/** Native select, Ocasio caret. Kept as a constant because the data URI
 *  contains double quotes, which cannot sit inside a JSX attribute. */
const SORT_CARET =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z' clip-rule='evenodd'/%3E%3C/svg%3E\")] " +
  'bg-[length:1.1rem] bg-[right_0.65rem_center] bg-no-repeat';

const VendorDiscovery = ({
  title,
  subtitle,
  fixedCategory,
}: {
  title: string;
  subtitle?: string;
  fixedCategory?: string;
}) => {
  const { params, setParams, clearFilters, activeFilterCount } = useMarketplaceParams(
    fixedCategory ? { category: fixedCategory } : {},
  );

  const [result, setResult] = useState<VendorSearchResponse | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    getFilterOptions()
      .then(setOptions)
      .catch(() => {
        // Filter controls degrade to empty option lists; results still load.
        setOptions(null);
      });

    // The same rows the homepage already reads. They give the category list its
    // counts and the search its suggestions — no extra query for either.
    getCategoryCounts()
      .then(setCategoryCounts)
      .catch(() => setCategoryCounts([]));
  }, []);

  const key = JSON.stringify(params);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    searchVendors({ ...params, pageSize: PAGE_SIZE })
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load vendors');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  const showCategory = !fixedCategory;

  // Kept verbatim: it is the page's live region, and the E2E suite reads it.
  const resultSummary = loading
    ? 'Searching…'
    : `${result?.totalCount ?? 0} vendor${result?.totalCount === 1 ? '' : 's'} found`;

  /**
   * A plain-language restatement of the current scope, assembled only from
   * filters that are actually set. Nothing is written for a state that is not
   * in the URL.
   */
  const scopeLine = useMemo(() => {
    const cat = fixedCategory ?? params.category;
    const parts: string[] = [];
    if (cat) parts.push(`${cat} vendors`);
    else parts.push('Vendors');
    if (params.location) parts.push(`in ${params.location}`);
    if (params.query) parts.push(`matching “${params.query}”`);
    return parts.length > 1 ? parts.join(' ') : null;
  }, [fixedCategory, params.category, params.location, params.query]);

  return (
    <div className="bg-canvas">
      <div className="shell py-[clamp(2rem,4vw,3.5rem)]">
        <header className="max-w-2xl">
          <h1 className="text-display-sm text-ink">{title}</h1>
          {subtitle && <p className="mt-2 max-w-prose text-muted">{subtitle}</p>}
        </header>

        {/* ── discovery ────────────────────────────────────────────────── */}
        <div className="mt-7 max-w-3xl">
          <MarketplaceSearch
            query={params.query ?? ''}
            options={options}
            categoryCounts={categoryCounts}
            onSearch={(q) => setParams({ q: q || undefined })}
            onPickCategory={(c) => setParams({ category: c, q: undefined })}
            onPickLocation={(l) => setParams({ location: l, q: undefined })}
          />
        </div>

        {/* The toolbar scrolls sideways on a phone rather than wrapping into a
            three-row block that pushes the results off the screen. */}
        <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="w-max sm:w-auto">
            <MarketplaceFilters
              options={options}
              categoryCounts={categoryCounts}
              category={showCategory ? params.category : undefined}
              location={params.location}
              minPrice={params.minPrice}
              maxPrice={params.maxPrice}
              minRating={params.minRating}
              service={params.service}
              activeFilterCount={activeFilterCount}
              onChange={setParams}
              onClear={clearFilters}
              showCategory={showCategory}
            />
          </div>
        </div>

        {/* ── results header ───────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col gap-4 border-b border-line pb-5">
          <div className="flex flex-col gap-3 min-[360px]:flex-row min-[360px]:items-end min-[360px]:justify-between min-[360px]:gap-x-4">
            <div className="min-w-0">
              <p className="text-[1.0625rem] font-semibold text-ink" aria-live="polite">
                {resultSummary}
              </p>
              {scopeLine && !loading && <p className="mt-1 text-sm text-muted">{scopeLine}</p>}
            </div>

            <div className="relative shrink-0">
              <label htmlFor="sort-by" className="sr-only">
                Sort by
              </label>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 hidden -translate-y-1/2 text-sm text-muted sm:block"
              >
                Sort
              </span>
              <select
                id="sort-by"
                value={params.sort}
                onChange={(e) => setParams({ sort: e.target.value as VendorSort })}
                className={`h-11 cursor-pointer appearance-none rounded-control border border-line-strong bg-surface pl-3.5 pr-9 text-sm sm:pl-[2.9rem] font-medium text-ink transition-colors hover:bg-canvas focus:border-brand-500 ${SORT_CARET}`}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ActiveFilterChips
            params={params}
            showCategory={showCategory}
            onRemove={setParams}
            onClear={clearFilters}
          />
        </div>

        {/* ── results ──────────────────────────────────────────────────── */}
        <div className="mt-8">
          {loading && <VendorGridSkeleton />}
          {error && !loading && <ErrorState message={error} onRetry={retry} />}

          {!loading && !error && result?.totalCount === 0 && (
            <EmptyState
              title={params.query ? `No vendors found for “${params.query}”` : 'No vendors match'}
              description={
                activeFilterCount > 0
                  ? 'Try removing a filter, widening the price range, or choosing another location.'
                  : 'Try a different search term, or browse every vendor.'
              }
              action={
                activeFilterCount > 0 ? (
                  <Button onClick={clearFilters}>Clear filters</Button>
                ) : (
                  <ButtonLink to="/vendors">Browse all vendors</ButtonLink>
                )
              }
            />
          )}

          {!loading && !error && result && result.vendors.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {result.vendors.map((vendor) => (
                  <VendorCard key={vendor.id} vendor={vendor} />
                ))}
              </div>

              <Pagination
                page={result.page}
                totalPages={result.totalPages}
                totalCount={result.totalCount}
                pageSize={result.pageSize}
                onPageChange={(p) => setParams({ page: p })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorDiscovery;
