import { useRef } from 'react'
import FeedCard from './FeedCard'
import useViewportTelemetry from '../hooks/useViewportTelemetry'

/**
 * FeedContainer
 *
 * Mobile-optimised, snap-scroll feed shell. Constrains itself to a max-width
 * of `md` (448 px) and scrolls vertically through `FeedCard` children.
 *
 * Phase 2 Pass 2: wires `useViewportTelemetry` so every card entrance / exit
 * fires structured telemetry events via `telemetryService`.
 *
 * Props:
 *  - recipes {object[]} — Array of recipe objects sourced from mockRecipes.json
 */
export default function FeedContainer({ recipes = [] }) {
  /**
   * Ref forwarded to the scrolling container so `useViewportTelemetry` can
   * use it as the IntersectionObserver `root`.
   * @type {React.RefObject<HTMLDivElement>}
   */
  const containerRef = useRef(null)

  // Attach viewport telemetry — fires heartbeat + dwell events as cards
  // enter/exit the visible area of this scroll container.
  useViewportTelemetry(containerRef, recipes)

  /**
   * Stub expand handler — Phase 2, Pass 1.
   * Logs the expansion target so downstream card/sheet components can be wired
   * in a later pass without side-effects.
   *
   * @param {object} recipe — The recipe the user tapped to expand.
   */
  function handleExpandRecipe(recipe) {
    console.log('[FeedContainer] expand requested:', {
      recipe_id: recipe.recipe_id,
      title:     recipe.title,
      slug:      recipe.slug,
    })
  }

  return (
    <div
      ref={containerRef}
      id="culinary-feed"
      className="h-screen w-full max-w-md mx-auto overflow-y-scroll snap-y snap-mandatory scrollbar-none relative bg-black shadow-2xl"
    >
      {recipes.map((recipe, index) => (
        /*
         * The `feed-card` class is the CSS selector target used by the
         * IntersectionObserver in `useViewportTelemetry` to discover cards.
         * It must be present on the outermost element that carries
         * `data-recipe-id` — which is the FeedCard root itself.
         * We wrap in a plain <div> with `feed-card` here to keep FeedCard
         * decoupled from observer concerns.
         */
        <div key={recipe.recipe_id} className="feed-card" data-recipe-id={recipe.recipe_id}>
          <FeedCard
            recipe={recipe}
            index={index}
            onExpandRecipe={handleExpandRecipe}
          />
        </div>
      ))}

      {/* Empty-state guard — renders only when the recipes array is genuinely empty */}
      {recipes.length === 0 && (
        <div className="h-screen flex flex-col items-center justify-center gap-3 text-neutral-400 px-8 text-center">
          <span className="text-4xl" aria-hidden="true">🍳</span>
          <p className="text-sm font-medium">No recipes available yet.</p>
        </div>
      )}
    </div>
  )
}
