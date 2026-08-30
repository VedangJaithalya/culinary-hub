import { useRef, useState, useEffect } from 'react'
import FeedCard from './FeedCard'
import RecipeModal from './RecipeModal'
import SavedDrawer from './SavedDrawer'
import CreatorProfileModal from './CreatorProfileModal'
import ShoppingListDrawer from './ShoppingListDrawer'
import useViewportTelemetry from '../hooks/useViewportTelemetry'
import { useFeedRanking } from '../hooks/useFeedRanking.js'
import { EVENT_TYPES } from '../data/dataContracts.js'
import { dispatchTelemetry } from '../services/telemetryService.js'
import { getDismissedRecipeIds } from '../services/dismissService.js'

/**
 * FeedContainer
 *
 * Mobile-optimised, snap-scroll feed shell. Constrains itself to a max-width
 * of `md` (448 px) and scrolls vertically through `FeedCard` children.
 *
 * Phase 2 Pass 3:
 *  - Owns the modal open/close state and checked-ingredients state.
 *  - Dispatches RECIPE_EXPAND telemetry (with dwell_before_expand_ms) on open.
 *  - Dispatches INGREDIENT_INTERACTION telemetry on checkbox toggle.
 *  - Locks/restores the scroll container when the modal is open.
 *
 * Phase 4, Pass 1:
 *  - Static `recipes` prop replaced by `useFeedRanking` dynamic queue.
 *  - Accepts no props — the feed is fully self-contained.
 *
 * Phase 4, Pass 2:
 *  - Floating saved-recipes bookmark FAB (fixed, top-right, z-40).
 *  - SavedDrawer mounted at root; handleSelectFromDrawer bridges drawer → modal.
 */
export default function FeedContainer() {
  // ── Dynamic feed ranking ─────────────────────────────────────────────────

  const { feedQueue } = useFeedRanking()

  // ── Dismissed recipes (explicit "not interested") ─────────────────────────
  // useFeedRanking already excludes previously-dismissed recipes from *new*
  // ranking passes, but the queue for the *current* session was ranked once
  // on mount — so a card dismissed just now still needs to be pulled out of
  // the already-computed queue immediately, not just excluded next time.
  const [dismissedIds, setDismissedIds] = useState(() => new Set(getDismissedRecipeIds()))
  const visibleFeedQueue = feedQueue.filter((r) => !dismissedIds.has(r.recipe_id))

  /**
   * Removes a recipe from the visible feed the instant it's dismissed.
   * Persistence + telemetry already happened inside FeedCard/dismissService;
   * this just updates local render state so the card disappears now.
   *
   * @param {object} recipe
   */
  function handleDismissRecipe(recipe) {
    setDismissedIds((prev) => new Set(prev).add(recipe.recipe_id))
  }

  // ── Refs ──────────────────────────────────────────────────────────────────

  /**
   * Forwarded to the scrolling container so `useViewportTelemetry` can use it
   * as the IntersectionObserver `root`.
   * @type {React.RefObject<HTMLDivElement>}
   */
  const containerRef = useRef(null)

  // ── Viewport telemetry hook ───────────────────────────────────────────────
  // Returns live refs that let us read the active card's entry timestamp at
  // the moment the user taps "expand", giving us dwell_before_expand_ms.
  // `activeRecipeId` is used to keep `currentIndex` in sync with the
  // IntersectionObserver so the ranking engine always knows the viewed prefix.
  const { activeRecipeId, entryTimestamp } = useViewportTelemetry(containerRef, visibleFeedQueue)

  // ── Modal / ingredient state ──────────────────────────────────────────────

  /** @type {[object|null, function]} The recipe currently shown in the modal. */
  const [selectedRecipe, setSelectedRecipe] = useState(null)

  /** @type {[boolean, function]} Controls modal visibility and CSS transitions. */
  const [isModalOpen, setIsModalOpen] = useState(false)

  /** @type {[boolean, function]} Controls SavedDrawer visibility. */
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false)

  /** @type {[boolean, function]} Controls ShoppingListDrawer visibility. */
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false)

  /** @type {[string|null, function]} creator_id shown in CreatorProfileModal; null = closed. */
  const [selectedCreatorId, setSelectedCreatorId] = useState(null)

  /**
   * Flat map of ingredient check state.
   * Keys are `${recipe_id}_${ingredient_id}`, values are boolean.
   * @type {[Record<string, boolean>, function]}
   */
  const [checkedIngredients, setCheckedIngredients] = useState({})

  // ── Sync currentIndex with the IntersectionObserver active card ──────────
  // Since useFeedRanking no longer manages currentIndex, we maintain it locally
  // here for the scroll-sync effect.
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleScroll() {
      const id = activeRecipeId.current
      if (!id) return
      const idx = visibleFeedQueue.findIndex((r) => r.recipe_id === id)
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFeedQueue, activeRecipeId])

  // ── Scroll lock side effect ───────────────────────────────────────────────
  // When the modal opens, swap the container's scroll/snap classes for
  // `overflow-hidden` so the snap feed does not scroll behind the drawer.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (isModalOpen) {
      el.classList.remove('overflow-y-scroll', 'snap-y', 'snap-mandatory')
      el.classList.add('overflow-hidden')
    } else {
      el.classList.remove('overflow-hidden')
      el.classList.add('overflow-y-scroll', 'snap-y', 'snap-mandatory')
    }
  }, [isModalOpen])

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Opens the modal for a recipe and dispatches a RECIPE_EXPAND telemetry event.
   *
   * @param {object} recipe         - The recipe to expand.
   * @param {string} triggerSource  - UI trigger: 'details_button' | 'card_tap'.
   */
  function handleOpenRecipe(recipe, triggerSource = 'card_tap') {
    // Compute dwell time from the viewport telemetry hook's live entry ref.
    // Falls back to 0 if no card is currently tracked (edge case: rapid tap).
    const dwellMs = entryTimestamp.current != null
      ? Date.now() - entryTimestamp.current
      : 0

    dispatchTelemetry(EVENT_TYPES.RECIPE_EXPAND, {
      recipe_id:            recipe.recipe_id,
      dwell_before_expand_ms: dwellMs,
      trigger_source:       triggerSource,
      default_tab_viewed:   'ingredients',
    })

    setSelectedRecipe(recipe)
    setIsModalOpen(true)
  }

  /**
   * Closes the modal and allows the CSS exit transition to play through before
   * we could optionally nullify selectedRecipe. We keep it set so the drawer
   * content doesn't vanish mid-transition — RecipeModal guards against null.
   */
  function handleCloseModal() {
    setIsModalOpen(false)
    // Delay clearing the recipe so the slide-down transition completes (300 ms)
    // before the content is unmounted.
    setTimeout(() => setSelectedRecipe(null), 320)
  }

  /**
   * Toggles one ingredient's checked state and dispatches an
   * INGREDIENT_INTERACTION telemetry event.
   *
   * @param {string} recipeId      - recipe_id that owns the ingredient.
   * @param {string} ingredientId  - Canonical ingredient_id being toggled.
   */
  function handleIngredientToggle(recipeId, ingredientId) {
    const key       = `${recipeId}_${ingredientId}`
    const isChecked = !checkedIngredients[key]

    const nextState = { ...checkedIngredients, [key]: isChecked }
    setCheckedIngredients(nextState)

    // Count how many ingredients in this specific recipe are now checked
    const recipeIngredients = selectedRecipe?.ingredients ?? []
    const newCheckedCount   = recipeIngredients.filter(
      (ing) => nextState[`${recipeId}_${ing.ingredient_id}`]
    ).length

    dispatchTelemetry(EVENT_TYPES.INGREDIENT_INTERACTION, {
      recipe_id:    recipeId,
      ingredient_id: ingredientId,
      action:       isChecked ? 'checked' : 'unchecked',
      session_progress: {
        total_ingredients_in_recipe: recipeIngredients.length,
        total_checked_count:         newCheckedCount,
      },
    })
  }

  /**
   * Closes the SavedDrawer and opens the RecipeModal for the selected recipe.
   * Called when the user taps a mini-card inside the drawer.
   *
   * @param {object} recipe - The recipe to open in the modal.
   */
  function handleSelectFromDrawer(recipe) {
    setIsSavedDrawerOpen(false)
    handleOpenRecipe(recipe, 'saved_drawer')
  }

  /**
   * Opens CreatorProfileModal for the given creator. Called from RecipeModal's byline.
   * @param {string} creatorId
   */
  function handleOpenCreator(creatorId) {
    setSelectedCreatorId(creatorId)
  }

  /**
   * Closes CreatorProfileModal and opens the RecipeModal for the selected recipe.
   * Called when the user taps one of the creator's recipes.
   *
   * @param {object} recipe - The recipe to open in the modal.
   */
  function handleSelectFromCreator(recipe) {
    setSelectedCreatorId(null)
    handleOpenRecipe(recipe, 'creator_profile')
  }

  /**
   * Swaps the RecipeModal to a "More Like This" recommendation. The modal
   * stays open — RecipeModal's render-time prevRecipeId reset already
   * handles switching tabs/rating/cook-count state for the new recipe.
   *
   * @param {object} recipe - The similar recipe to open.
   */
  function handleSelectSimilarRecipe(recipe) {
    handleOpenRecipe(recipe, 'similar_rail')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating Saved Recipes FAB ──────────────────────────────────── */}
      <button
        type="button"
        id="open-saved-drawer-btn"
        aria-label="Open saved recipes"
        onClick={() => setIsSavedDrawerOpen(true)}
        className="fixed top-5 right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-md border border-white/20 text-amber-400 shadow-lg hover:bg-neutral-800/90 active:scale-90 transition-all duration-150"
      >
        {/* Solid bookmark icon */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>

      {/* ── Floating Shopping List FAB ───────────────────────────────────── */}
      <button
        type="button"
        id="open-shopping-list-btn"
        aria-label="Open shopping list"
        onClick={() => setIsShoppingListOpen(true)}
        className="fixed top-[76px] right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-md border border-white/20 text-emerald-400 shadow-lg hover:bg-neutral-800/90 active:scale-90 transition-all duration-150"
      >
        <span className="text-lg" aria-hidden="true">🛒</span>
      </button>

      <div
        ref={containerRef}
        id="culinary-feed"
        className="h-screen w-full max-w-md mx-auto overflow-y-scroll snap-y snap-mandatory scrollbar-none relative bg-black shadow-2xl"
      >
        {visibleFeedQueue.map((recipe, index) => (
          /*
           * The `feed-card` class + `data-recipe-id` are both required by the
           * IntersectionObserver in `useViewportTelemetry`.
           */
          <div
            key={recipe.recipe_id}
            className="feed-card"
            data-recipe-id={recipe.recipe_id}
          >
            <FeedCard
              recipe={recipe}
              index={index}
              onExpandRecipe={handleOpenRecipe}
              onDismiss={handleDismissRecipe}
            />
          </div>
        ))}

        {/* Empty-state guard: shown when the ranked queue is temporarily empty */}
        {visibleFeedQueue.length === 0 && (
          <div className="h-screen flex flex-col items-center justify-center gap-3 text-neutral-400 px-8 text-center">
            <span className="text-4xl" aria-hidden="true">🍳</span>
            <p className="text-sm font-medium">No recipes available yet.</p>
          </div>
        )}
      </div>

      {/*
       * RecipeModal renders as a fixed overlay at the document level (via
       * z-50) so it escapes the max-w-md feed column correctly. Mounting it
       * outside the scrolling div also avoids any stacking-context issues.
       * We always mount it (not conditional) so the slide-down exit transition
       * plays correctly when isModalOpen flips to false.
       */}
      <RecipeModal
        recipe={selectedRecipe}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onIngredientToggle={handleIngredientToggle}
        checkedIngredientsMap={checkedIngredients}
        onOpenCreator={handleOpenCreator}
        onSelectSimilarRecipe={handleSelectSimilarRecipe}
      />

      {/*
       * SavedDrawer, CreatorProfileModal, and ShoppingListDrawer are always
       * mounted. pointer-events-none is applied internally when closed so
       * none of them ever block feed interaction.
       */}
      <SavedDrawer
        isOpen={isSavedDrawerOpen}
        onClose={() => setIsSavedDrawerOpen(false)}
        onRecipeSelect={handleSelectFromDrawer}
      />

      <CreatorProfileModal
        creatorId={selectedCreatorId}
        isOpen={selectedCreatorId != null}
        onClose={() => setSelectedCreatorId(null)}
        onRecipeSelect={handleSelectFromCreator}
      />

      <ShoppingListDrawer
        isOpen={isShoppingListOpen}
        onClose={() => setIsShoppingListOpen(false)}
      />
    </>
  )
}
