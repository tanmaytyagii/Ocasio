import { Link } from 'react-router-dom';
import { listFeaturedVendors } from '../services/vendors';
import { useAsync } from '../hooks/useAsync';
import VendorCard from '../components/VendorCard';
import { VendorGridSkeleton, ErrorState } from '../components/AsyncStates';

/**
 * Highest-rated active vendors, read from the database.
 *
 * Previously a hardcoded array whose ratings and cities contradicted the vendor
 * detail pages, and which linked to ids that did not exist (audit BUG-1/BUG-4).
 */
const FeaturedVendors = () => {
  const { data, loading, error, retry } = useAsync(() => listFeaturedVendors(3), []);

  return (
    <div className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">Top-rated vendors</h2>

        {loading && <VendorGridSkeleton count={3} />}
        {error && !loading && <ErrorState message={error} onRetry={retry} />}

        {!loading && !error && data && data.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {data.map((vendor) => (
                <VendorCard key={vendor.id} vendor={vendor} />
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link
                to="/vendors"
                className="inline-block rounded-lg border border-purple-600 px-6 py-3 text-purple-600 transition-colors hover:bg-purple-50"
              >
                Browse all vendors
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FeaturedVendors;
