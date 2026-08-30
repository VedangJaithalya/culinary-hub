/**
 * @fileoverview StarRating — shared 5-star rating control.
 *
 * Two modes:
 *  - Display-only: renders `rating` (may be fractional, e.g. 4.8) as filled/
 *    empty stars rounded to the nearest whole star. Used to show a recipe's
 *    aggregate average.
 *  - Interactive: renders clickable stars that call `onRate(value)` with an
 *    integer 1-5. Used to let the user submit their own rating.
 *
 * Props:
 *  - rating       {number}    Value to visualise (0-5, may be fractional in display mode).
 *  - interactive  {boolean}   Whether stars are clickable. Default false.
 *  - onRate       {function}  Called with (1-5) when an interactive star is clicked.
 *  - size         {string}    Tailwind size classes for each star icon. Default 'w-4 h-4'.
 */

import { useState } from 'react'

export default function StarRating({ rating = 0, interactive = false, onRate, size = 'w-4 h-4' }) {
  const [hoverValue, setHoverValue] = useState(null)

  const displayValue = interactive && hoverValue != null ? hoverValue : Math.round(rating)

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={interactive ? 'Rate this recipe' : `Rated ${rating.toFixed(1)} out of 5`}
      onMouseLeave={() => interactive && setHoverValue(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= displayValue
        const star = (
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            className={`${size} transition-colors duration-100 ${
              filled ? 'text-amber-400' : 'text-white/20'
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.364 1.118l1.287 3.959c.299.921-.756 1.688-1.539 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.783.57-1.838-.197-1.539-1.118l1.287-3.959a1 1 0 00-.364-1.118L2.063 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.285-3.958z" />
          </svg>
        )

        if (!interactive) {
          return <span key={n}>{star}</span>
        }

        return (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
            aria-checked={n === Math.round(rating)}
            role="radio"
            onMouseEnter={() => setHoverValue(n)}
            onClick={() => onRate?.(n)}
            className="active:scale-90 transition-transform duration-100"
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}
