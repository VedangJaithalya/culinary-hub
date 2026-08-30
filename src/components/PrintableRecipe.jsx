/**
 * @fileoverview PrintableRecipe — hidden print-only recipe sheet.
 *
 * Product/UX: "Share/export a single recipe as a link or PDF."
 *
 * There's no PDF library available (no network access to install one), so
 * "export as PDF" uses the browser's own print-to-PDF: this component
 * renders a clean, light-background, print-optimised layout that's hidden
 * on screen (`hidden print:block`, Tailwind's built-in `print:` variant) and
 * shown exclusively inside `@media print` (see index.css), which also hides
 * everything else on the page for that one print job. Calling
 * `window.print()` while this is mounted with a recipe produces a
 * print/"Save as PDF" dialog containing just the recipe.
 *
 * Rendered once, always mounted, at the app root (`FeedContainer`) so it's
 * available regardless of which modal is open when Export is tapped.
 *
 * @property {object|null} recipe - The recipe to render, or null to render nothing.
 */
export default function PrintableRecipe({ recipe }) {
  if (!recipe) return null

  const {
    title,
    cuisine_id,
    difficulty_tier,
    prep_time_minutes,
    cook_time_minutes,
    total_time_minutes,
    servings,
    description,
    ingredients = [],
    steps = [],
  } = recipe

  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number)
  const label = (slug) => (slug ? slug.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '')

  return (
    <div id="printable-recipe" className="hidden print:block bg-white text-black p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{title}</h1>
      {description && <p className="text-sm text-neutral-600 mb-3">{description}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-neutral-700 mb-6 border-y border-neutral-300 py-2">
        {cuisine_id && <span>Cuisine: {label(cuisine_id)}</span>}
        {difficulty_tier && <span>Difficulty: {label(difficulty_tier)}</span>}
        {prep_time_minutes != null && <span>Prep: {prep_time_minutes}m</span>}
        {cook_time_minutes != null && <span>Cook: {cook_time_minutes}m</span>}
        {total_time_minutes != null && <span>Total: {total_time_minutes}m</span>}
        {servings != null && <span>Servings: {servings}</span>}
      </div>

      <h2 className="text-base font-bold mb-2">Ingredients</h2>
      <ul className="mb-6 columns-2 gap-6 text-sm leading-relaxed">
        {ingredients.map((ing) => (
          <li key={ing.ingredient_id} className="break-inside-avoid mb-1">
            {ing.quantity != null ? `${ing.quantity} ` : ''}
            {ing.unit ? `${ing.unit} ` : ''}
            {ing.name}
            {ing.preparation_note ? ` (${ing.preparation_note})` : ''}
          </li>
        ))}
      </ul>

      <h2 className="text-base font-bold mb-2">Instructions</h2>
      <ol className="flex flex-col gap-2 text-sm leading-relaxed">
        {sortedSteps.map((step) => (
          <li key={step.step_number} className="flex gap-2 break-inside-avoid">
            <span className="font-bold shrink-0">{step.step_number}.</span>
            <span>{step.instruction_text}</span>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-[10px] text-neutral-400">Printed from CulinaryFeed</p>
    </div>
  )
}
