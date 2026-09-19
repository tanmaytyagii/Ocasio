import { Link } from 'react-router-dom';
import { Star, MapPin } from 'lucide-react';
import FavoriteButton from './FavoriteButton';
import { Badge, Card } from './ui';

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
 * One vendor in a grid.
 *
 * Hierarchy runs name → location → rating → price, with the price anchored to
 * the card footer so a row of cards lines up regardless of description length.
 *
 * A seeded rating is labelled rather than shown as a review count; passing a
 * fabricated figure off as customer feedback is what rating_is_demo exists to
 * prevent.
 */
const VendorCard = ({ vendor }: { vendor: VendorCardData }) => (
  <Card interactive className="group relative flex flex-col overflow-hidden">
    <FavoriteButton
      vendorId={vendor.id}
      vendorName={vendor.business_name}
      className="absolute right-3 top-3 z-10"
    />

    <Link to={`/vendors/${vendor.slug}`} className="flex flex-1 flex-col">
      <div className="relative aspect-[4/3] overflow-hidden bg-canvas">
        <img
          src={vendor.hero_image_url ?? ''}
          alt={vendor.business_name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <Badge tone="neutral" className="absolute bottom-3 left-3 bg-surface/95 backdrop-blur">
          {vendor.category}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold text-ink group-hover:text-brand-700">
          {vendor.business_name}
        </h3>

        <p className="mt-1.5 flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {vendor.location}
        </p>

        <div className="mt-2.5 flex items-center gap-1.5 text-sm">
          <Star className="h-4 w-4 fill-current text-amber-400" aria-hidden="true" />
          <span className="font-medium text-ink">{vendor.rating.toFixed(1)}</span>
          <span className="text-muted">
            {vendor.rating_is_demo
              ? '· sample rating'
              : `· ${vendor.review_count} review${vendor.review_count === 1 ? '' : 's'}`}
          </span>
        </div>

        {vendor.description && (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">
            {vendor.description}
          </p>
        )}

        {/* mt-auto pins the price row to the bottom so cards align in a grid. */}
        <div className="mt-auto flex items-baseline gap-1.5 border-t border-line pt-4 text-sm">
          {vendor.starting_price !== null ? (
            <>
              <span className="text-muted">From</span>
              <span className="text-base font-semibold text-ink">
                {formatRupees(vendor.starting_price)}
              </span>
            </>
          ) : (
            <span className="text-muted">Price on request</span>
          )}
        </div>
      </div>
    </Link>
  </Card>
);

export default VendorCard;
