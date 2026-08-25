import FeedCard from './FeedCard'

/**
 * FeedContainer
 *
 * Mobile-optimised, snap-scroll feed shell. Constrains itself to a max-width
 * of `md` (448 px) and scrolls vertically through `FeedCard` children.
 *
 * Props:
 *  - recipes {object[]} — Array of recipe objects sourced from mockRecipes.json
 */
export default function FeedContainer({ recipes = [] }) {
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
      id="culinary-feed"
      className="h-screen w-full max-w-md mx-auto overflow-y-scroll snap-y snap-mandatory scrollbar-none relative bg-black shadow-2xl"
    >
      {recipes.map((recipe, index) => (
        <FeedCard
          key={recipe.recipe_id}
          recipe={recipe}
          index={index}
          onExpandRecipe={handleExpandRecipe}
        />
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
