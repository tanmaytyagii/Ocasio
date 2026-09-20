import { ButtonLink } from './ui';
import { listFeaturedVendors } from '../services/vendors';
import { useAsync } from '../hooks/useAsync';
import VendorCard from '../components/VendorCard';
import { VendorGridSkeleton, ErrorState } from '../components/ui';

/**
 * Highest-rated active vendors, read from the database.
 *
 * Previously a hardcoded array whose ratings and cities contradicted the vendor
 * detail pages, and which linked to ids that did not exist (audit BUG-1/BUG-4).
 */
const FeaturedVendors = () => {
  const { data, loading, error, retry } = useAsync(() => listFeaturedVendors(3), []);

  return (
    <section className="bg-canvas py-16 sm:py-20">
      <div className="mx-auto max-w-[96rem] px-6 sm:px-8 lg:px-12 xl:px-16">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-display-sm text-ink">Top-rated vendors</h2>
            <p className="mt-2 text-muted">
              Ranked by rating, then review count. No paid placement.
            </p>
          </div>
        </div>

        {loading && <VendorGridSkeleton count={3} />}
        {error && !loading && <ErrorState message={error} onRetry={retry} />}

        {!loading && !error && data && data.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((vendor) => (
                <VendorCard key={vendor.id} vendor={vendor} />
              ))}
            </div>
            <div className="mt-10 text-center">
              <ButtonLink to="/vendors" variant="secondary" size="lg">
                Browse all vendors
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default FeaturedVendors;
