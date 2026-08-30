import { useState, useEffect } from 'react'
import mockRecipes from '../data/mockRecipes.json'

/**
 * SavedDrawer
 *
 * A right-side slide-over panel that displays the user's saved recipes
 * (persisted in `culinaryfeed_saved_recipes` localStorage key).
 *
 * DOM Safety guarantee: the root container always has `pointer-events-none`
 * applied when `!isOpen` so it can never block touches on the feed beneath.
 *
 * Props:
 *  - isOpen         {boolean}  — Controls visibility and CSS slide transition.
 *  - onClose        {function} — Called when the backdrop or close button is tapped.
 *  - onRecipeSelect {function} — Called with (recipe) when a mini-card is tapped.
 */
export default function SavedDrawer({ isOpen, onClose, onRecipeSelect }) {
  // ── Saved list state ──────────────────────────────────────────────────────

  /** @type {[object[], function]} Filtered subset of mockRecipes the user has saved. */
  const [savedList, setSavedList] = useState([])

  /**
   * Re-read localStorage every time the drawer opens so the list is always
   * fresh (the user may have saved/unsaved recipes since last open).
   */
  useEffect(() => {
    if (!isOpen) return

    try {
      const raw  = localStorage.getItem('culinaryfeed_saved_recipes') || '[]'
      const ids  = JSON.parse(raw)
      const list = Array.isArray(ids)
        ? mockRecipes.filter((r) => ids.includes(r.recipe_id))
        : []
      // Intentional: re-syncing from localStorage (an external system) each
      // time the drawer opens, not reacting to a prop change — the
      // documented valid case for setState-in-effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedList(list)
    } catch {
      // Malformed JSON — show empty list gracefully
      setSavedList([])
    }
  }, [isOpen])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    /*
     * Root: always mounted, never blocking. `pointer-events-none` when closed
     * ensures zero interaction interference with the feed scroll and cards.
     */
    <div
      className={`fixed inset-0 z-40 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* ── Slide-over panel ──────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Saved recipes"
        className={`absolute top-0 right-0 h-full w-80 max-w-[90vw] bg-neutral-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            {/* Bookmark icon */}
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-amber-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <h2 className="text-base font-semibold text-white">
              Saved Recipes
            </h2>
            {savedList.length > 0 && (
              <span className="ml-1 text-xs font-medium text-amber-400 bg-amber-400/15 px-2 py-0.5 rounded-full">
                {savedList.length}
              </span>
            )}
          </div>

          <button
            type="button"
            id="saved-drawer-close-btn"
            aria-label="Close saved recipes drawer"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white transition-all duration-150"
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Scrollable recipe list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
          {savedList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="text-4xl" aria-hidden="true">🔖</span>
              <p className="text-sm font-medium text-neutral-400 leading-relaxed">
                No saved recipes yet.<br />
                Tap the bookmark on any card to save it here.
              </p>
            </div>
          ) : (
            savedList.map((recipe) => (
              <SavedMiniCard
                key={recipe.recipe_id}
                recipe={recipe}
                onClick={() => onRecipeSelect(recipe)}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * SavedMiniCard
 *
 * A compact, tappable card representing a saved recipe inside the drawer.
 *
 * @param {{ recipe: object, onClick: function }} props
 */
function SavedMiniCard({ recipe, onClick }) {
  const {
    recipe_id,
    title,
    media_url,
    cuisine_id,
    difficulty_tier,
    prep_time_minutes,
    cook_time_minutes,
  } = recipe

  const cuisineLabel = cuisine_id
    ? cuisine_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  const totalTime =
    (prep_time_minutes ?? 0) + (cook_time_minutes ?? 0)

  const tierColour = {
    beginner:     'bg-emerald-500/80 text-white',
    easy:         'bg-emerald-500/80 text-white',
    intermediate: 'bg-amber-400/80  text-black',
    advanced:     'bg-rose-500/80   text-white',
    expert:       'bg-rose-700/80   text-white',
  }[difficulty_tier] ?? 'bg-white/20 text-white'

  return (
    <button
      type="button"
      id={`saved-mini-card-${recipe_id}`}
      aria-label={`Open ${title}`}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/8 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-neutral-800">
        {media_url ? (
          <img
            src={media_url}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">
            🍽️
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug line-clamp-2 mb-1">
          {title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {cuisineLabel && (
            <span className="text-[10px] font-medium text-white/60 uppercase tracking-wide">
              {cuisineLabel}
            </span>
          )}
          {difficulty_tier && (
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${tierColour}`}>
              {difficulty_tier}
            </span>
          )}
          {totalTime > 0 && (
            <span className="text-[10px] font-medium text-white/50">
              {totalTime}m
            </span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4 text-white/30 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
