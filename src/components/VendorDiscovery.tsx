import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchVendors, getFilterOptions } from '../services/vendors';
import type { VendorSearchResponse } from '../services/vendors';
import type { FilterOptions, VendorSort } from '../types/database';
import { useMarketplaceParams, SORT_LABELS } from '../hooks/useMarketplaceParams';
import VendorCard from './VendorCard';
import MarketplaceFilters from './MarketplaceFilters';
import Pagination from './Pagination';
import { VendorGridSkeleton, ErrorState, EmptyState } from './AsyncStates';

/**
 * The marketplace discovery surface, shared by /vendors, /search and
 * /category/:slug. They differ only in heading and whether the category is
 * fixed, so they are the same component rather than three near-copies.
 *
 * All state lives in the URL (see useMarketplaceParams), so a result set can be
 * refreshed, shared and navigated with browser back/forward.
 */
const PAGE_SIZE = 12;

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

  const resultSummary = loading
    ? 'Searching…'
    : `${result?.totalCount ?? 0} vendor${result?.totalCount === 1 ? '' : 's'} found`;

  return (
    <div className="bg-gray-50 pt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-4xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mb-6 text-gray-600">{subtitle}</p>}

        <MarketplaceFilters
          options={options}
          category={fixedCategory ? undefined : params.category}
          location={params.location}
          minPrice={params.minPrice}
          maxPrice={params.maxPrice}
          minRating={params.minRating}
          service={params.service}
          activeFilterCount={activeFilterCount}
          onChange={setParams}
          onClear={clearFilters}
          showCategory={!fixedCategory}
        />

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-gray-600" aria-live="polite">
            {resultSummary}
          </p>

          <div className="flex items-center gap-2">
            <label htmlFor="sort-by" className="text-sm font-medium text-gray-700">
              Sort by
            </label>
            <select
              id="sort-by"
              value={params.sort}
              onChange={(e) => setParams({ sort: e.target.value as VendorSort })}
              className="rounded-lg border border-gray-300 p-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <VendorGridSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={retry} />}

        {!loading && !error && result?.totalCount === 0 && (
          <EmptyState
            title="No vendors match"
            description={
              activeFilterCount > 0
                ? 'Try widening or clearing your filters.'
                : 'Try a different search term, or browse every vendor.'
            }
            action={
              activeFilterCount > 0 ? (
                <button
                  onClick={clearFilters}
                  className="rounded-lg bg-purple-600 px-5 py-2.5 text-white hover:bg-purple-700"
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  to="/vendors"
                  className="rounded-lg bg-purple-600 px-5 py-2.5 text-white hover:bg-purple-700"
                >
                  Browse all vendors
                </Link>
              )
            }
          />
        )}

        {!loading && !error && result && result.vendors.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
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
  );
};

export default VendorDiscovery;
