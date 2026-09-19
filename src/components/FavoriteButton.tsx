import { Heart } from 'lucide-react';
import { useFavorites } from '../contexts/FavoritesContext';

/**
 * Save/unsave control.
 *
 * aria-pressed carries the state so screen readers announce it, and the label
 * changes with the state rather than relying on the icon's fill alone.
 */
const FavoriteButton = ({
  vendorId,
  vendorName,
  size = 'md',
  className = '',
}: {
  vendorId: string;
  vendorName: string;
  size?: 'sm' | 'md';
  className?: string;
}) => {
  const { isFavorite, toggleFavorite, pending } = useFavorites();
  const saved = isFavorite(vendorId);
  const busy = pending.has(vendorId);
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${vendorName} from saved vendors` : `Save ${vendorName}`}
      disabled={busy}
      onClick={(e) => {
        // Cards wrap the button in a Link; don't navigate when saving.
        e.preventDefault();
        e.stopPropagation();
        void toggleFavorite(vendorId);
      }}
      className={`rounded-full bg-white/90 p-2 shadow-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:opacity-60 ${className}`}
    >
      <Heart
        className={`${icon} ${saved ? 'fill-current text-brand-700' : 'text-muted'}`}
        aria-hidden="true"
      />
    </button>
  );
};

export default FavoriteButton;
