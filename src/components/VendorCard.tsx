import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Vendor } from '../types/database';

/**
 * The vendor card, previously duplicated across CategoryPage, SearchResults and
 * FeaturedVendors with three slightly different markups. Same visual design as
 * before — white card, shadow, 48-unit image, purple accents.
 */
const VendorCard = ({ vendor, showCategory = true }: { vendor: Vendor; showCategory?: boolean }) => (
  <Link
    to={`/vendors/${vendor.slug}`}
    className="block overflow-hidden rounded-lg bg-white shadow-md transition-shadow duration-300 hover:shadow-xl"
  >
    <div className="relative h-48">
      <img
        src={vendor.hero_image_url ?? ''}
        alt={vendor.business_name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
    <div className="p-6">
      <h3 className="text-xl font-semibold text-gray-900">{vendor.business_name}</h3>
      <p className="text-gray-600">{showCategory ? vendor.category : vendor.location}</p>
      <div className="mt-2 flex items-center">
        <Star className="h-5 w-5 fill-current text-yellow-400" aria-hidden="true" />
        <span className="ml-1 text-gray-700">{vendor.rating.toFixed(1)}</span>
        <span className="mx-1 text-gray-400">•</span>
        <span className="text-gray-600">{vendor.review_count} reviews</span>
      </div>
      {showCategory && <p className="mt-2 text-gray-600">{vendor.location}</p>}
      {vendor.description && (
        <p className="mt-2 line-clamp-2 text-gray-600">{vendor.description}</p>
      )}
    </div>
  </Link>
);

export default VendorCard;
