import { Link } from 'react-router-dom';
import { listVendors } from '../services/vendors';
import { useAsync } from '../hooks/useAsync';
import { usePageMeta } from '../hooks/usePageMeta';
import VendorCard from '../components/VendorCard';
import { VendorGridSkeleton, ErrorState, EmptyState } from '../components/AsyncStates';

const VendorsIndex = () => {
  usePageMeta(
    'Browse event vendors — Ocasio',
    'Browse venues, catering, photography and decoration vendors for weddings, corporate events and parties across India.',
  );

  const { data, loading, error, retry } = useAsync(() => listVendors(), []);

  return (
    <div className="bg-gray-50 pt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-4xl font-bold text-gray-900">All vendors</h1>
        <p className="mb-8 text-gray-600">
          {loading ? 'Loading vendors…' : `${data?.length ?? 0} vendors available`}
        </p>

        {loading && <VendorGridSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={retry} />}

        {!loading && !error && data?.length === 0 && (
          <EmptyState
            title="No vendors yet"
            description="No vendors are listed at the moment. Check back soon."
            action={
              <Link
                to="/become-vendor"
                className="rounded-lg bg-purple-600 px-5 py-2.5 text-white hover:bg-purple-700"
              >
                List your business
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

export default VendorsIndex;
