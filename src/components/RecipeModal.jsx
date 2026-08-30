/**
 * @fileoverview RecipeModal — Phase 2, Pass 3
 *
 * Bottom-sheet drawer that slides up over the feed when a user expands a
 * recipe card. Renders two tabs — Ingredients and Instructions — and emits
 * ingredient interaction events via callback props.
 *
 * Animation: pure CSS transform/opacity transitions (no external libs).
 * Accessibility: focus-trap on open, aria-modal, keyboard-close on Escape.
 *
 * Props:
 *  - recipe              {object|null}  The expanded recipe object.
 *  - isOpen              {boolean}      Controls visibility and CSS transitions.
 *  - onClose             {function}     Called when the user dismisses the modal.
 *  - onIngredientToggle  {function}     Called with (recipeId, ingredientId) on checkbox toggle.
 *  - checkedIngredientsMap {object}     Flat map of `${recipeId}_${ingredientId}` → boolean.
 *  - onOpenCreator        {function}    Called with (creatorId) when the byline is tapped.
 */

import { useState, useEffect, useRef } from 'react'
import mockCreators from '../data/mockCreators.json'
import StarRating from './StarRating'
import CookModeView from './CookModeView'
import { getRatingStats, submitRating } from '../services/ratingService.js'
import { getDisplayCookCount, startCookMode, completeCookMode } from '../services/cookService.js'
import { addRecipeToShoppingList } from '../services/shoppingListService.js'

// ── Ingredient category display config ─────────────────────────────────────────
const CATEGORY_META = {
  produce:    { label: 'Produce',   emoji: '🥦' },
  protein:    { label: 'Protein',   emoji: '🥩' },
  dairy:      { label: 'Dairy',     emoji: '🧀' },
  pantry:     { label: 'Pantry',    emoji: '🫙' },
  spice:      { label: 'Spices',    emoji: '🌶️' },
  condiment:  { label: 'Condiments', emoji: '🍯' },
  grain:      { label: 'Grains',    emoji: '🌾' },
  beverage:   { label: 'Beverages', emoji: '🥤' },
  other:      { label: 'Other',     emoji: '📦' },
}

// ── Helper: format seconds as a human-readable duration string ─────────────────
function formatDuration(seconds) {
  if (!seconds) return null
  if (seconds < 60)  return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// ── Helper: group ingredients by category ─────────────────────────────────────
function groupByCategory(ingredients) {
  const groups = {}
  for (const ing of ingredients) {
    const cat = (ing.category || 'other').toLowerCase()
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(ing)
  }
  return groups
}

export default function RecipeModal({
  recipe,
  isOpen,
  onClose,
  onIngredientToggle,
  checkedIngredientsMap,
  onOpenCreator,
}) {
  const [activeTab, setActiveTab] = useState('ingredients')
  const closeButtonRef = useRef(null)
  const drawerRef      = useRef(null)

  // ── Rating overlay + Cook Mode + shopping-list-confirmation state ────────
  // Re-derived whenever a new recipe is opened; updated locally (without a
  // re-read) the instant the user submits a rating / cooks / adds to list so
  // the UI feels instant.
  const [ratingStats, setRatingStats] = useState(() =>
    recipe ? getRatingStats(recipe) : { averageRating: 0, ratingCount: 0, userRating: null }
  )
  const [isCookModeOpen, setIsCookModeOpen] = useState(false)
  const [displayCookCount, setDisplayCookCount] = useState(() =>
    recipe ? getDisplayCookCount(recipe) : 0
  )
  const [addedToShoppingList, setAddedToShoppingList] = useState(false)

  // ── Reset per-recipe UI state when a new recipe is opened ────────────────
  // Deliberately done during render (React's documented "adjusting state
  // when a prop changes" pattern — see react.dev/learn/you-might-not-need-an-effect)
  // rather than in a useEffect: it's a pure reaction to `recipe.recipe_id`
  // changing, not a synchronisation with anything external, so it doesn't
  // need the extra render-then-effect round trip an effect would add.
  const [prevRecipeId, setPrevRecipeId] = useState(recipe?.recipe_id ?? null)
  if (recipe && recipe.recipe_id !== prevRecipeId) {
    setPrevRecipeId(recipe.recipe_id)
    setActiveTab('ingredients')
    setRatingStats(getRatingStats(recipe))
    setDisplayCookCount(getDisplayCookCount(recipe))
    setAddedToShoppingList(false)
  }

  // ── Focus management: focus the close button when modal opens ──────────────
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      // Small delay lets the CSS transition begin before focus fires
      const tid = setTimeout(() => closeButtonRef.current?.focus(), 50)
      return () => clearTimeout(tid)
    }
  }, [isOpen])

  // ── Keyboard: Escape closes the modal ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Guard: nothing to render until a recipe is selected
  if (!recipe) return null

  const {
    recipe_id,
    title,
    cuisine_id,
    difficulty_tier,
    prep_time_minutes,
    cook_time_minutes,
    calorie_count,
    creator_user_id,
    ingredients = [],
    steps = [],
  } = recipe

  // ── Derived labels ─────────────────────────────────────────────────────────
  const cuisineLabel = cuisine_id
    ? cuisine_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  const difficultyLabel = difficulty_tier
    ? difficulty_tier.charAt(0).toUpperCase() + difficulty_tier.slice(1)
    : null

  const tierColour = {
    beginner:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    easy:         'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    intermediate: 'bg-amber-400/20  text-amber-300  border-amber-400/30',
    advanced:     'bg-rose-500/20   text-rose-300   border-rose-500/30',
    expert:       'bg-rose-700/20   text-rose-300   border-rose-700/30',
  }[difficulty_tier] ?? 'bg-white/10 text-white/70 border-white/20'

  // ── Creator lookup ─────────────────────────────────────────────────────────
  const creator = creator_user_id
    ? mockCreators.find((c) => c.creator_id === creator_user_id)
    : null

  // ── Ingredient checked-count summary ──────────────────────────────────────
  const checkedCount = ingredients.filter(
    (ing) => checkedIngredientsMap[`${recipe_id}_${ing.ingredient_id}`]
  ).length

  // ── Grouped + sorted ingredients ──────────────────────────────────────────
  const grouped = groupByCategory(ingredients)

  // ── Sorted steps ──────────────────────────────────────────────────────────
  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number)

  // ── Handlers: rating, cook mode, shopping list ─────────────────────────────

  /** Submits (or updates) the user's own star rating for this recipe. */
  function handleRate(value) {
    const updated = submitRating(recipe, value)
    setRatingStats(updated)
  }

  /** Opens Cook Mode and dispatches RECIPE_COOK_START. */
  function handleStartCooking() {
    startCookMode(recipe_id)
    setIsCookModeOpen(true)
  }

  /** Called by CookModeView when the user finishes the final step. */
  function handleFinishCooking() {
    completeCookMode(recipe_id, sortedSteps.length)
    setDisplayCookCount(getDisplayCookCount(recipe))
    setIsCookModeOpen(false)
  }

  /** Adds every ingredient in this recipe to the persisted shopping list. */
  function handleAddToShoppingList() {
    addRecipeToShoppingList(recipe)
    setAddedToShoppingList(true)
  }

  return (
    <>
    {/*
     * Backdrop overlay — fades in/out via opacity transition.
     * `pointer-events-none` when closed prevents click-through issues.
     */}
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Recipe details: ${title}`}
      className={[
        'fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm',
        'transition-opacity duration-300',
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
      onClick={(e) => {
        // Close when clicking the bare backdrop (not the drawer itself)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/*
       * Drawer container — slides up from the bottom via translateY transition.
       * max-w-md keeps it aligned with the FeedContainer column.
       */}
      <div
        ref={drawerRef}
        className={[
          'w-full max-w-md mx-auto bg-neutral-900 rounded-t-3xl',
          'border-t border-neutral-800 max-h-[85vh] flex flex-col overflow-hidden',
          'transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* ── Drag handle ─────────────────────────────────────────────────── */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" aria-hidden="true" />
        </div>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="px-5 pt-2 pb-4 shrink-0 border-b border-neutral-800">
          <div className="flex items-start justify-between gap-3">
            {/* Title */}
            <h2 className="text-lg font-bold text-white leading-snug line-clamp-1 flex-1 min-w-0">
              {title}
            </h2>

            {/* Close button */}
            <button
              ref={closeButtonRef}
              type="button"
              id="recipe-modal-close-btn"
              aria-label="Close recipe details"
              onClick={onClose}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all duration-150 text-white/70 hover:text-white"
            >
              <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {cuisineLabel && (
              <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/15">
                {cuisineLabel}
              </span>
            )}
            {difficultyLabel && (
              <span className={`text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border ${tierColour}`}>
                {difficultyLabel}
              </span>
            )}
            {prep_time_minutes != null && (
              <span className="text-[11px] font-medium text-white/60 flex items-center gap-1">
                <span aria-hidden="true">🕐</span> Prep {prep_time_minutes}m
              </span>
            )}
            {cook_time_minutes != null && (
              <span className="text-[11px] font-medium text-white/60 flex items-center gap-1">
                <span aria-hidden="true">🔥</span> Cook {cook_time_minutes}m
              </span>
            )}
            {calorie_count != null && (
              <span className="text-[11px] font-medium text-white/60 flex items-center gap-1">
                <span aria-hidden="true">⚡</span> {calorie_count} kcal
              </span>
            )}
            <span className="text-[11px] font-medium text-white/60 flex items-center gap-1">
              <span aria-hidden="true">🍳</span> Cooked {displayCookCount.toLocaleString()}x
            </span>
          </div>

          {/* Creator byline + rating row */}
          <div className="flex items-center justify-between gap-3 mt-3">
            {creator ? (
              <button
                type="button"
                id="recipe-creator-byline-btn"
                onClick={() => onOpenCreator?.(creator.creator_id)}
                className="flex items-center gap-1.5 min-w-0 group"
              >
                <span className="text-sm shrink-0" aria-hidden="true">{creator.avatar_emoji}</span>
                <span className="text-xs font-medium text-white/50 group-hover:text-white/80 transition-colors duration-150 truncate">
                  by {creator.display_name}
                </span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              <StarRating
                rating={ratingStats.userRating ?? ratingStats.averageRating}
                interactive
                onRate={handleRate}
                size="w-4 h-4"
              />
              <span className="text-[11px] font-medium text-white/40">
                {ratingStats.averageRating.toFixed(1)} ({ratingStats.ratingCount.toLocaleString()})
              </span>
            </div>
          </div>
        </header>

        {/* ── Tab navigation ───────────────────────────────────────────────── */}
        <div className="px-5 pt-3 pb-0 shrink-0">
          <div
            role="tablist"
            aria-label="Recipe sections"
            className="relative flex gap-1 bg-white/5 rounded-xl p-1"
          >
            {[
              { id: 'ingredients', label: `Ingredients (${ingredients.length})` },
              { id: 'instructions', label: `Instructions (${sortedSteps.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tab-panel-${tab.id}`}
                id={`tab-${tab.id}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200',
                  activeTab === tab.id
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-white/50 hover:text-white/80',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab panels (scrollable) ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ── INGREDIENTS TAB ─────────────────────────────────────────────── */}
          {activeTab === 'ingredients' && (
            <div
              id="tab-panel-ingredients"
              role="tabpanel"
              aria-labelledby="tab-ingredients"
              className="px-5 pt-3 pb-8"
            >
              {/* Progress summary */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-white/50 font-medium">
                  <span className="text-violet-400 font-bold">{checkedCount}</span>
                  {' of '}
                  <span className="text-white/70">{ingredients.length}</span>
                  {' ingredients collected'}
                </p>
                {checkedCount > 0 && (
                  <div className="h-1 flex-1 mx-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-300"
                      style={{ width: `${(checkedCount / ingredients.length) * 100}%` }}
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>

              {/* Add all ingredients to the cross-recipe shopping list */}
              <button
                type="button"
                id="add-to-shopping-list-btn"
                onClick={handleAddToShoppingList}
                disabled={addedToShoppingList}
                className={[
                  'w-full mb-5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.98]',
                  addedToShoppingList
                    ? 'bg-emerald-500/15 text-emerald-300 cursor-default'
                    : 'bg-white/8 text-white/80 hover:bg-white/12',
                ].join(' ')}
              >
                {addedToShoppingList ? 'Added to Shopping List ✓' : '🛒 Add All to Shopping List'}
              </button>

              {/* Category groups */}
              {Object.entries(grouped).map(([cat, items]) => {
                const meta = CATEGORY_META[cat] ?? CATEGORY_META.other
                return (
                  <div key={cat} className="mb-5">
                    {/* Category header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span aria-hidden="true" className="text-base">{meta.emoji}</span>
                      <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
                        {meta.label}
                      </h3>
                      <div className="flex-1 h-px bg-white/8" aria-hidden="true" />
                      <span className="text-[10px] text-white/30 font-medium">{items.length}</span>
                    </div>

                    {/* Ingredient rows */}
                    <ul className="flex flex-col gap-1.5">
                      {items.map((ing) => {
                        const key     = `${recipe_id}_${ing.ingredient_id}`
                        const checked = Boolean(checkedIngredientsMap[key])
                        return (
                          <li key={ing.ingredient_id}>
                            <label
                              htmlFor={`ing-check-${key}`}
                              className={[
                                'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer',
                                'transition-colors duration-150',
                                checked
                                  ? 'bg-violet-500/10'
                                  : 'bg-white/4 hover:bg-white/8 active:bg-white/6',
                              ].join(' ')}
                            >
                              {/* Custom checkbox */}
                              <div className="relative shrink-0">
                                <input
                                  type="checkbox"
                                  id={`ing-check-${key}`}
                                  checked={checked}
                                  onChange={() => onIngredientToggle(recipe_id, ing.ingredient_id)}
                                  className="sr-only"
                                />
                                <div
                                  aria-hidden="true"
                                  className={[
                                    'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150',
                                    checked
                                      ? 'bg-violet-500 border-violet-500'
                                      : 'bg-transparent border-white/25',
                                  ].join(' ')}
                                >
                                  {checked && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                                    </svg>
                                  )}
                                </div>
                              </div>

                              {/* Name + quantity */}
                              <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                                <span
                                  className={[
                                    'text-sm font-medium leading-snug transition-all duration-150',
                                    checked
                                      ? 'line-through text-white/30'
                                      : 'text-white/90',
                                  ].join(' ')}
                                >
                                  {ing.name}
                                  {ing.preparation_note && (
                                    <span className="text-white/35 font-normal text-xs ml-1.5">
                                      ({ing.preparation_note})
                                    </span>
                                  )}
                                </span>
                                {(ing.quantity != null || ing.unit) && (
                                  <span
                                    className={[
                                      'text-xs font-semibold shrink-0 transition-colors duration-150',
                                      checked ? 'text-white/20' : 'text-violet-400',
                                    ].join(' ')}
                                  >
                                    {ing.quantity != null ? ing.quantity : ''} {ing.unit ?? ''}
                                  </span>
                                )}
                              </div>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── INSTRUCTIONS TAB ────────────────────────────────────────────── */}
          {activeTab === 'instructions' && (
            <div
              id="tab-panel-instructions"
              role="tabpanel"
              aria-labelledby="tab-instructions"
              className="px-5 pt-3 pb-8"
            >
              {sortedSteps.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-8">No steps available.</p>
              ) : (
                <>
                  {/* Launches the full-screen, step-by-step Cook Mode overlay */}
                  <button
                    type="button"
                    id="start-cook-mode-btn"
                    onClick={handleStartCooking}
                    className="w-full mb-5 py-3 rounded-xl text-sm font-bold bg-violet-500 hover:bg-violet-400 active:scale-[0.98] text-white transition-all duration-150 flex items-center justify-center gap-2"
                  >
                    <span aria-hidden="true">▶</span>
                    Start Cooking ({sortedSteps.length} steps)
                  </button>
                <ol className="flex flex-col gap-4">
                  {sortedSteps.map((step) => {
                    const duration = formatDuration(step.duration_estimate_seconds)
                    return (
                      <li key={step.step_number} className="flex gap-3">
                        {/* Step number badge */}
                        <div className="shrink-0 w-7 h-7 mt-0.5 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-violet-400">
                            {step.step_number}
                          </span>
                        </div>

                        {/* Instruction + duration */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/85 leading-relaxed">
                            {step.instruction_text}
                          </p>
                          {duration && (
                            <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-white/35 bg-white/5 px-2 py-0.5 rounded-full">
                              <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
                                <circle cx="8" cy="8" r="6.5" />
                                <path strokeLinecap="round" d="M8 5v3.5l2 1.5" />
                              </svg>
                              {duration}
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    <CookModeView
      isOpen={isCookModeOpen}
      recipe={recipe}
      onClose={() => setIsCookModeOpen(false)}
      onFinish={handleFinishCooking}
    />
    </>
  )
}
