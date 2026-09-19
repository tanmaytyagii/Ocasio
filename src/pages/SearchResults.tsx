import { Link, useSearchParams } from 'react-router-dom';
import { listVendors } from '../services/vendors';
import { useAsync } from '../hooks/useAsync';
import { usePageMeta } from '../hooks/usePageMeta';
import VendorCard from '../components/VendorCard';
import { VendorGridSkeleton, ErrorState, EmptyState } from '../components/AsyncStates';

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const city = searchParams.get('city') ?? '';
  const eventType = searchParams.get('type') ?? '';

  usePageMeta(
    query ? `"${query}" — vendor search — Ocasio` : 'Search vendors — Ocasio',
    'Search venues, catering, photography and decoration vendors across India.',
  );

  // eventType maps onto the free-text query until vendor_event_types exists.
  const { data, loading, error, retry } = useAsync(
    () => listVendors({ query: query || eventType || undefined, location: city || undefined }),
    [query, city, eventType],
  );

  return (
    <div className="bg-gray-50 pt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">
          Search results
          {query && ` for "${query}"`}
          {eventType && !query && ` for ${eventType}`}
          {city && ` in ${city}`}
        </h1>
        <p className="mb-8 text-gray-600">
          {loading ? 'Searching…' : `${data?.length ?? 0} vendors found`}
        </p>

        {loading && <VendorGridSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={retry} />}

        {!loading && !error && data?.length === 0 && (
          <EmptyState
            title="No vendors match that search"
            description="Try a different city, a broader search term, or browse every vendor."
            action={
              <Link
                to="/vendors"
                className="rounded-lg bg-purple-600 px-5 py-2.5 text-white hover:bg-purple-700"
              >
                Browse all vendors
              </Link>
            }
          />
        )}

        {!loading && !error && data && data.length > 0 && (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {data.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchResults;
