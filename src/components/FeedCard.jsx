import { useState } from 'react'
import { BookmarkIcon, XCircleIcon } from './icons/ActionIcons'
import { dispatchTelemetry } from '../services/telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'
import { dismissRecipe } from '../services/dismissService.js'

/**
 * FeedCard
 *
 * A full-screen, snap-scroll recipe card. Designed for mobile viewports inside
 * a `snap-y snap-mandatory` scroll container.
 *
 * Props:
 *  - recipe {object}           — A single recipe object from mockRecipes.json
 *  - index  {number}           — Zero-based position in the feed (used for telemetry)
 *  - onExpandRecipe {function} — Called with (recipe, triggerSource) when the user
 *                               opens recipe details. triggerSource is one of:
 *                               'details_button' | 'card_tap'
 *  - onDismiss {function}      — Called with (recipe) when the user taps "not
 *                               interested". Parent (FeedContainer) is
 *                               responsible for actually removing the card
 *                               from the visible queue; this component only
 *                               persists the dismissal and fires telemetry.
 *
 * Phase 4, Pass 2:
 *  - Like (Heart) and Save (Bookmark) micro-interaction buttons with active states.
 *  - Dispatches RECIPE_LIKE / RECIPE_SAVE telemetry on each toggle.
 *  - Saves persist to `culinaryfeed_saved_recipes` in localStorage.
 *  - Share button removed.
 *
 * Smarter Ranking, Item 6:
 *  - Explicit "not interested" (dismiss) button — strong negative signal,
 *    distinct from the inferred skip. See `dismissService.js`.
 */
export default function FeedCard({ recipe, index, onExpandRecipe, onDismiss }) {
  const {
    recipe_id,
    cuisine_id,
    difficulty_tier,
    title,
    media_url,
    prep_time_minutes,
    cook_time_minutes,
    calorie_count,
    steps = [],
  } = recipe

  // ── Derived display values ────────────────────────────────────────────────
  const cuisineLabel = cuisine_id
    ? cuisine_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—'

  const difficultyLabel = difficulty_tier
    ? difficulty_tier.charAt(0).toUpperCase() + difficulty_tier.slice(1)
    : '—'

  const prepLabel    = prep_time_minutes != null ? `${prep_time_minutes}m` : '—'
  const cookLabel    = cook_time_minutes  != null ? `${cook_time_minutes}m` : '—'
  const calorieLabel = calorie_count      != null ? `${calorie_count} kcal` : '—'
  const stepsCount   = Array.isArray(steps) ? steps.length : 0

  // ── Difficulty colour accent ───────────────────────────────────────────────
  const tierColour = {
    beginner:     'bg-emerald-500/80 text-white',
    easy:         'bg-emerald-500/80 text-white',
    intermediate: 'bg-amber-400/80  text-black',
    advanced:     'bg-rose-500/80   text-white',
    expert:       'bg-rose-700/80   text-white',
  }[difficulty_tier] ?? 'bg-white/20 text-white'

  // ── Micro-interaction state ───────────────────────────────────────────────

  const [isLiked, setIsLiked] = useState(false)

  /**
   * Initialize isSaved by checking localStorage for this recipe_id.
   * Defensive parsing: falls back to `false` on any failure.
   */
  const [isSaved, setIsSaved] = useState(() => {
    if (!recipe_id) return false
    try {
      const raw = localStorage.getItem('culinaryfeed_saved_recipes') || '[]'
      const saved = JSON.parse(raw)
      return Array.isArray(saved) && saved.includes(recipe_id)
    } catch {
      return false
    }
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Toggles the liked state and dispatches RECIPE_LIKE telemetry.
   * e.stopPropagation() prevents the card_tap handler from also firing.
   *
   * @param {React.MouseEvent} e
   */
  function handleLike(e) {
    e.stopPropagation()
    const nextLiked = !isLiked
    setIsLiked(nextLiked)
    dispatchTelemetry(EVENT_TYPES.RECIPE_LIKE, {
      recipe_id,
      is_liked: nextLiked,
    })
  }

  /**
   * Toggles the saved state, updates localStorage, and dispatches RECIPE_SAVE.
   * e.stopPropagation() prevents the card_tap handler from also firing.
   *
   * @param {React.MouseEvent} e
   */
  function handleSave(e) {
    e.stopPropagation()
    const nextSaved = !isSaved
    setIsSaved(nextSaved)

    // Persist to localStorage
    try {
      const raw   = localStorage.getItem('culinaryfeed_saved_recipes') || '[]'
      const saved = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []
      const next  = nextSaved
        ? [...new Set([...saved, recipe_id])]
        : saved.filter((id) => id !== recipe_id)
      localStorage.setItem('culinaryfeed_saved_recipes', JSON.stringify(next))
    } catch {
      // localStorage unavailable — state update still applies in memory
    }

    dispatchTelemetry(EVENT_TYPES.RECIPE_SAVE, {
      recipe_id,
      is_saved: nextSaved,
    })
  }

  /**
   * Explicit "not interested" dismissal. Persists + dispatches telemetry via
   * dismissService, then notifies the parent so the card can be removed from
   * the visible feed immediately — a dismissal should never resurface, not
   * just be down-ranked.
   *
   * @param {React.MouseEvent} e
   */
  function handleDismiss(e) {
    e.stopPropagation()
    dismissRecipe({ recipe_id, cuisine_id })
    onDismiss?.(recipe)
  }

  return (
    <article
      className="h-screen w-full snap-start snap-always relative flex flex-col justify-between overflow-hidden bg-neutral-900 select-none"
      data-recipe-id={recipe_id}
      data-feed-index={index}
      data-cuisine-id={cuisine_id}
    >
      {/* ── Background image ──────────────────────────────────────────────── */}
      <img
        src={media_url}
        alt={title}
        className="object-cover w-full h-full absolute inset-0"
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
      />

      {/* ── Darkening gradient overlay ────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="bg-gradient-to-b from-black/40 via-transparent to-black/90 absolute inset-0 pointer-events-none"
      />

      {/* ── Top bar: cuisine badge + difficulty badge ─────────────────────── */}
      <header className="relative z-10 flex items-center gap-2 px-4 pt-5">
        <span className="text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white border border-white/20">
          {cuisineLabel}
        </span>
        <span
          className={`text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full backdrop-blur-sm border border-white/20 ${tierColour}`}
        >
          {difficultyLabel}
        </span>
      </header>

      {/* ── Bottom overlay (left content) + right action rail ────────────── */}
      {/*
       * The entire bottom metadata zone is a tap target (`card_tap`).
       * The CTA button inside it is a more specific trigger (`details_button`).
       * stopPropagation on the button ensures only one event fires.
       */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`View details for ${title}`}
        className="relative z-10 flex items-end justify-between px-4 pb-8 gap-4 cursor-pointer"
        onClick={() => onExpandRecipe(recipe, 'card_tap')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onExpandRecipe(recipe, 'card_tap')
          }
        }}
      >

        {/* Left: recipe meta + CTA */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Title */}
          <h2 className="text-xl font-bold text-white leading-snug drop-shadow-md line-clamp-2">
            {title}
          </h2>

          {/* Meta chips row */}
          <div className="flex flex-wrap items-center gap-2">
            <MetaChip icon="🕐" label={`Prep ${prepLabel}`} />
            <MetaChip icon="🔥" label={`Cook ${cookLabel}`} />
            <MetaChip icon="⚡" label={calorieLabel} />
            <MetaChip icon="📋" label={`${stepsCount} steps`} />
          </div>

          {/* Expand CTA — fires 'details_button', stops propagation */}
          <button
            type="button"
            id={`expand-recipe-btn-${recipe_id}`}
            onClick={(e) => {
              e.stopPropagation()
              onExpandRecipe(recipe, 'details_button')
            }}
            className="mt-1 self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md border border-white/25 transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span>View Recipe &amp; Ingredients</span>
            <svg
              aria-hidden="true"
              className="w-4 h-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Right: vertical action rail — Like (Heart) + Save (Bookmark) only */}
        <nav
          aria-label="Recipe actions"
          className="flex flex-col items-center gap-5 pb-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Like button */}
          <button
            type="button"
            id={`like-btn-${recipe_id}`}
            aria-label={isLiked ? 'Unlike recipe' : 'Like recipe'}
            aria-pressed={isLiked}
            onClick={handleLike}
            className="flex flex-col items-center gap-1 group"
          >
            <span
              className={`w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-md border transition-all duration-150 group-active:scale-90
                ${isLiked
                  ? 'bg-rose-500/80 border-rose-400/50 text-white'
                  : 'bg-black/35 border-white/20 text-white group-hover:bg-white/25'
                }`}
            >
              <HeartIcon filled={isLiked} />
            </span>
          </button>

          {/* Save button */}
          <button
            type="button"
            id={`save-btn-${recipe_id}`}
            aria-label={isSaved ? 'Unsave recipe' : 'Save recipe'}
            aria-pressed={isSaved}
            onClick={handleSave}
            className="flex flex-col items-center gap-1 group"
          >
            <span
              className={`w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-md border transition-all duration-150 group-active:scale-90
                ${isSaved
                  ? 'bg-amber-500/80 border-amber-400/50 text-white'
                  : 'bg-black/35 border-white/20 text-white group-hover:bg-white/25'
                }`}
            >
              <BookmarkIcon filled={isSaved} />
            </span>
          </button>

          {/* Dismiss ("not interested") button — explicit negative feedback */}
          <button
            type="button"
            id={`dismiss-btn-${recipe_id}`}
            aria-label="Not interested — remove from feed"
            onClick={handleDismiss}
            className="flex flex-col items-center gap-1 group"
          >
            <span className="w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-md border border-white/20 bg-black/35 text-white group-hover:bg-white/25 transition-all duration-150 group-active:scale-90">
              <XCircleIcon />
            </span>
          </button>
        </nav>
      </div>
    </article>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Small frosted-glass metadata chip */
function MetaChip({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-white/90 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-lg">
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  )
}

/**
 * Heart icon — outline by default, solid when filled.
 * @param {{ filled?: boolean }} props
 */
function HeartIcon({ filled = false }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      className="w-6 h-6"
      fill={filled ? 'currentColor' : 'none'}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  )
}
