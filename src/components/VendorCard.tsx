import { Link } from 'react-router-dom';
import { Star, MapPin } from 'lucide-react';
import FavoriteButton from './FavoriteButton';

/** The fields a card needs, satisfied by both search results and vendor rows. */
export interface VendorCardData {
  id: string;
  slug: string;
  business_name: string;
  description: string | null;
  category: string;
  location: string;
  hero_image_url: string | null;
  rating: number;
  review_count: number;
  rating_is_demo: boolean;
  starting_price: number | null;
}

const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * One vendor in a grid. Same visual design as before — white card, shadow,
 * h-48 image, purple accents — with price and a save control added.
 */
const VendorCard = ({
  vendor,
  serviceSummary,
}: {
  vendor: VendorCardData;
  serviceSummary?: string[];
}) => (
  <div className="group relative overflow-hidden rounded-lg bg-white shadow-md transition-shadow duration-300 hover:shadow-xl">
    <FavoriteButton
      vendorId={vendor.id}
      vendorName={vendor.business_name}
      className="absolute right-3 top-3 z-10"
    />

    <Link to={`/vendors/${vendor.slug}`} className="block">
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
        <p className="text-gray-600">{vendor.category}</p>

        <div className="mt-2 flex items-center">
          <Star className="h-5 w-5 fill-current text-yellow-400" aria-hidden="true" />
          <span className="ml-1 text-gray-700">{vendor.rating.toFixed(1)}</span>
          <span className="mx-1 text-gray-400">•</span>
          {/* A seeded figure is labelled rather than presented as review count. */}
          <span className="text-gray-600">
            {vendor.rating_is_demo ? 'sample rating' : `${vendor.review_count} reviews`}
          </span>
        </div>

        <p className="mt-2 flex items-center text-gray-600">
          <MapPin className="mr-1 h-4 w-4 text-gray-400" aria-hidden="true" />
          {vendor.location}
        </p>

        {vendor.description && (
          <p className="mt-2 line-clamp-2 text-gray-600">{vendor.description}</p>
        )}

        {serviceSummary && serviceSummary.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {serviceSummary.slice(0, 3).map((s) => (
              <span
                key={s}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {vendor.starting_price !== null && (
          <p className="mt-4 border-t pt-3 text-sm text-gray-600">
            From{' '}
            <span className="text-base font-semibold text-gray-900">
              {formatRupees(vendor.starting_price)}
            </span>
          </p>
        )}
      </div>
    </Link>
  </div>
);

export default VendorCard;
