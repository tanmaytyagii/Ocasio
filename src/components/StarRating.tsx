import { Star } from 'lucide-react';

/**
 * Star display and input.
 *
 * Read-only mode renders text plus stars so the value is available to screen
 * readers without counting icons. Input mode is a radiogroup, so it is operable
 * by keyboard rather than being a row of clickable icons.
 */
const StarRating = ({
  value,
  onChange,
  size = 'md',
  label,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md';
  label?: string;
}) => {
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const readOnly = !onChange;

  if (readOnly) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="sr-only">{value} out of 5 stars</span>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            aria-hidden="true"
            className={`${icon} ${star <= Math.round(value) ? 'fill-current text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label={label ?? 'Rating'} className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onClick={() => onChange(star)}
          className="rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-purple-600"
        >
          <Star
            aria-hidden="true"
            className={`${icon} ${star <= value ? 'fill-current text-yellow-400' : 'text-gray-300'}`}
          />
        </button>
      ))}
    </div>
  );
};

export default StarRating;
