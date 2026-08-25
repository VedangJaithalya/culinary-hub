import { useRef, useState, useEffect } from 'react'
import FeedCard from './FeedCard'
import RecipeModal from './RecipeModal'
import useViewportTelemetry from '../hooks/useViewportTelemetry'
import { EVENT_TYPES } from '../data/dataContracts.js'
import { dispatchTelemetry } from '../services/telemetryService.js'

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
 * Props:
 *  - recipes {object[]} — Array of recipe objects sourced from mockRecipes.json
 */
export default function FeedContainer({ recipes = [] }) {
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
  const { entryTimestamp } = useViewportTelemetry(containerRef, recipes)

  // ── Modal / ingredient state ──────────────────────────────────────────────

  /** @type {[object|null, function]} The recipe currently shown in the modal. */
  const [selectedRecipe, setSelectedRecipe] = useState(null)

  /** @type {[boolean, function]} Controls modal visibility and CSS transitions. */
  const [isModalOpen, setIsModalOpen] = useState(false)

  /**
   * Flat map of ingredient check state.
   * Keys are `${recipe_id}_${ingredient_id}`, values are boolean.
   * @type {[Record<string, boolean>, function]}
   */
  const [checkedIngredients, setCheckedIngredients] = useState({})

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={containerRef}
        id="culinary-feed"
        className="h-screen w-full max-w-md mx-auto overflow-y-scroll snap-y snap-mandatory scrollbar-none relative bg-black shadow-2xl"
      >
        {recipes.map((recipe, index) => (
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
            />
          </div>
        ))}

        {/* Empty-state guard */}
        {recipes.length === 0 && (
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
      />
    </>
  )
}
