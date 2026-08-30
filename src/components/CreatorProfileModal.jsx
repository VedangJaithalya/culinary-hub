/**
 * @fileoverview CreatorProfileModal — creator profile + follow mechanic.
 *
 * Every recipe already carries a `creator_user_id`, and `ACTION_TYPES`
 * already defines CREATOR_FOLLOW/CREATOR_UNFOLLOW, but nothing in the app
 * surfaced a creator or let a user follow one. This is a right-side
 * slide-over (visually consistent with SavedDrawer) showing a creator's
 * profile and their recipes, reachable by tapping the byline in
 * RecipeModal.
 *
 * Props:
 *  - creatorId      {string|null} The creator_id to display. Modal is closed when null.
 *  - isOpen         {boolean}     Controls visibility and slide transition.
 *  - onClose        {function}    Called when the backdrop or close button is tapped.
 *  - onRecipeSelect {function}    Called with (recipe) when a mini-card is tapped.
 */

import { useEffect, useState } from 'react'
import mockRecipes from '../data/mockRecipes.json'
import mockCreators from '../data/mockCreators.json'
import { isFollowingCreator, toggleFollowCreator } from '../services/followService.js'

function cuisineLabel(cuisineId) {
  return cuisineId
    ? cuisineId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null
}

export default function CreatorProfileModal({ creatorId, isOpen, onClose, onRecipeSelect }) {
  const creator = creatorId ? mockCreators.find((c) => c.creator_id === creatorId) : null
  const [isFollowing, setIsFollowing] = useState(false)

  // Re-read follow state whenever the drawer opens for a (possibly new) creator.
  useEffect(() => {
    // Intentional: re-syncing from localStorage (an external system) each
    // time the drawer opens for a creator, not reacting to a prop change —
    // the documented valid case for setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen && creatorId) setIsFollowing(isFollowingCreator(creatorId))
  }, [isOpen, creatorId])

  function handleToggleFollow() {
    if (!creatorId) return
    setIsFollowing(toggleFollowCreator(creatorId))
  }

  const creatorRecipes = creator
    ? creator.recipe_ids
        .map((id) => mockRecipes.find((r) => r.recipe_id === id))
        .filter(Boolean)
    : []

  const displayFollowerCount = (creator?.follower_count ?? 0) + (isFollowing ? 1 : 0)

  return (
    <div
      className={`fixed inset-0 z-[55] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
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
        aria-label={creator ? `${creator.display_name}'s profile` : 'Creator profile'}
        className={`absolute top-0 right-0 h-full w-80 max-w-[90vw] bg-neutral-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between px-5 pt-6 pb-2 shrink-0">
          <h2 className="text-base font-semibold text-white">Creator</h2>
          <button
            type="button"
            id="creator-profile-close-btn"
            aria-label="Close creator profile"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white transition-all duration-150"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {creator ? (
          <>
            {/* ── Profile summary ──────────────────────────────────────────── */}
            <div className="px-5 pb-5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-2xl shrink-0">
                  <span aria-hidden="true">{creator.avatar_emoji}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-snug line-clamp-1">
                    {creator.display_name}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {displayFollowerCount.toLocaleString()} followers · {creatorRecipes.length} recipes
                  </p>
                </div>
              </div>

              <p className="text-xs text-white/60 leading-relaxed mt-3">{creator.bio}</p>

              <button
                type="button"
                id="creator-follow-toggle-btn"
                onClick={handleToggleFollow}
                aria-pressed={isFollowing}
                className={[
                  'mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98]',
                  isFollowing
                    ? 'bg-white/10 text-white/70 hover:bg-white/15'
                    : 'bg-violet-500 text-white hover:bg-violet-400',
                ].join(' ')}
              >
                {isFollowing ? 'Following ✓' : 'Follow'}
              </button>
            </div>

            {/* ── Recipe list ──────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
              {creatorRecipes.map((recipe) => (
                <button
                  key={recipe.recipe_id}
                  type="button"
                  onClick={() => onRecipeSelect(recipe)}
                  className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/8 transition-all duration-150"
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-neutral-800">
                    <img
                      src={recipe.media_url}
                      alt={recipe.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white leading-snug line-clamp-1">
                      {recipe.title}
                    </p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                      {cuisineLabel(recipe.cuisine_id)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm px-6 text-center">
            Creator not found.
          </div>
        )}
      </aside>
    </div>
  )
}
