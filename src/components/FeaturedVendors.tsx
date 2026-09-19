import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { vendorData } from '../data/vendors';
import type { Vendor } from '../utils/dataGenerator';

/**
 * Featured vendors are selected from the shared catalogue rather than being
 * hardcoded here. The previous local array declared its own rating, review
 * count and city for the same businesses, so the homepage contradicted the
 * vendor detail pages — and it linked to catering-1 / decoration-1 /
 * photography-1, which did not exist under the old global ID counter.
 */
const FEATURED_IDS = ['catering-1', 'decoration-1', 'photography-1'];

const vendors = FEATURED_IDS.map((id) => vendorData.find((vendor) => vendor.id === id)).filter(
  (vendor): vendor is Vendor => vendor !== undefined,
);

const FeaturedVendors = () => {
  return (
    <div className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          Top-Rated Vendors
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {vendors.map((vendor) => (
            <Link 
              to={`/vendor/${vendor.id}`} 
              key={vendor.id} 
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300"
            >
              <div className="relative h-48">
                <img
                  src={vendor.image}
                  alt={vendor.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900">{vendor.name}</h3>
                <p className="text-gray-600">{vendor.category}</p>
                <div className="mt-2 flex items-center">
                  <Star className="h-5 w-5 text-yellow-400 fill-current" />
                  <span className="ml-1 text-gray-700">{vendor.rating}</span>
                  <span className="mx-1 text-gray-400">•</span>
                  <span className="text-gray-600">{vendor.reviews} reviews</span>
                </div>
                <p className="mt-2 text-gray-600">{vendor.location}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FeaturedVendors;