/**
 * @fileoverview CulinaryFeed Similarity Engine — Smarter Ranking, Item 4
 *
 * Content-based "more like this" recommendations — pure structural
 * similarity between recipes, with zero dependency on user telemetry or
 * personalization. Complements the affinity-driven ranking in
 * `rankingEngine.js`, which only connects recipes through user affinity —
 * two recipes from different cuisines that are both vegan, say, never get
 * connected there even though a person who likes one probably likes both.
 *
 * Each recipe is reduced to two feature sets:
 *  - an "ingredient" set — every `ingredient_id` it uses.
 *  - a "category" set — its cuisine_id, secondary_cuisine_ids, dietary_tags,
 *    and content tags (namespaced so, e.g., a cuisine_id and a tag that
 *    happen to share a string never collide).
 *
 * Similarity between two recipes combines weighted Jaccard similarity
 * (|intersection| / |union|) over each set independently — 60% ingredient,
 * 40% category — rather than merging them into one flat set. Ingredient
 * sets are typically much larger than category sets, so a flat union would
 * let whichever one is bigger swamp the other depending on recipe size.
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps.
 *  - Fully defensive: malformed recipes contribute empty feature sets
 *    rather than throwing.
 *  - Deterministic: same catalogue state always produces the same output —
 *    unlike the personalized ranking engine, this never involves randomness.
 *
 * @module similarityEngine
 */

import mockRecipes from '../data/mockRecipes.json'

const INGREDIENT_SIMILARITY_WEIGHT = 0.6
const CATEGORY_SIMILARITY_WEIGHT = 0.4

/**
 * Builds the ingredient feature set for one recipe.
 * @param {object} recipe
 * @returns {Set<string>}
 */
function buildIngredientFeatureSet(recipe) {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  return new Set(ingredients.map((i) => i?.ingredient_id).filter(Boolean))
}

/**
 * Builds the category feature set for one recipe: cuisine, secondary
 * cuisines, dietary tags, and content tags — everything describing *what
 * kind* of recipe this is, independent of its exact ingredient list. Values
 * are namespaced (`cuisine:`, `dietary:`, `tag:`) so identical strings from
 * different fields never collide in the set.
 *
 * @param {object} recipe
 * @returns {Set<string>}
 */
function buildCategoryFeatureSet(recipe) {
  const values = []

  if (recipe?.cuisine_id) values.push(`cuisine:${recipe.cuisine_id}`)
  if (Array.isArray(recipe?.secondary_cuisine_ids)) {
    for (const id of recipe.secondary_cuisine_ids) {
      if (id) values.push(`cuisine:${id}`)
    }
  }
  if (Array.isArray(recipe?.dietary_tags)) {
    for (const tag of recipe.dietary_tags) {
      if (tag) values.push(`dietary:${tag}`)
    }
  }
  if (Array.isArray(recipe?.tags)) {
    for (const tag of recipe.tags) {
      if (tag) values.push(`tag:${tag}`)
    }
  }

  return new Set(values)
}

/**
 * Jaccard similarity between two sets: |intersection| / |union|. Returns 0
 * when both sets are empty, rather than the NaN a literal 0/0 divide would
 * produce.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0..1
 */
function jaccardSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 0

  let intersectionSize = 0
  for (const value of a) {
    if (b.has(value)) intersectionSize += 1
  }

  const unionSize = a.size + b.size - intersectionSize
  return unionSize > 0 ? intersectionSize / unionSize : 0
}

// =============================================================================
// MODULE-LEVEL LOOKUP TABLE
// Pre-index every recipe's feature sets once at module load, mirroring the
// recipeById pattern already used in affinityModel.js/sessionTransformer.js.
// =============================================================================

/** @type {Map<string, { ingredients: Set<string>, category: Set<string> }>} */
const featureSetsByRecipeId = new Map(
  mockRecipes.map((recipe) => [
    recipe.recipe_id,
    {
      ingredients: buildIngredientFeatureSet(recipe),
      category: buildCategoryFeatureSet(recipe),
    },
  ])
)

/**
 * Computes the combined content-similarity score between two recipes by
 * `recipe_id`.
 *
 * @param {string} recipeIdA
 * @param {string} recipeIdB
 * @returns {number} 0..1
 */
function computeSimilarity(recipeIdA, recipeIdB) {
  const a = featureSetsByRecipeId.get(recipeIdA)
  const b = featureSetsByRecipeId.get(recipeIdB)
  if (!a || !b) return 0

  const ingredientScore = jaccardSimilarity(a.ingredients, b.ingredients)
  const categoryScore = jaccardSimilarity(a.category, b.category)

  return (
    ingredientScore * INGREDIENT_SIMILARITY_WEIGHT +
    categoryScore * CATEGORY_SIMILARITY_WEIGHT
  )
}

// =============================================================================
// MAIN EXPORT — findSimilarRecipes
// =============================================================================

/**
 * Finds the top-N recipes most similar to the given recipe, by weighted
 * content (ingredient + category) Jaccard similarity. Purely structural —
 * no user personalization or telemetry involved, so the same recipe always
 * returns the same recommendations for every user, unlike the affinity-
 * driven feed ranking.
 *
 * @param {string} recipeId       - recipe_id to find similar recipes for.
 * @param {object} [options]
 * @param {number} [options.topN=6]
 * @returns {Array<object & { similarity_score: number }>}
 *   The most similar recipes (excluding the recipe itself), each augmented
 *   with a `similarity_score` (0..1), sorted descending. Recipes with zero
 *   similarity are excluded rather than padding the list. Returns an empty
 *   array if the recipe isn't found in the catalogue.
 */
export function findSimilarRecipes(recipeId, { topN = 6 } = {}) {
  if (!recipeId || !featureSetsByRecipeId.has(recipeId)) return []

  const scored = []
  for (const recipe of mockRecipes) {
    if (recipe.recipe_id === recipeId) continue

    const similarity_score = computeSimilarity(recipeId, recipe.recipe_id)
    if (similarity_score > 0) {
      scored.push({ ...recipe, similarity_score })
    }
  }

  scored.sort((a, b) => b.similarity_score - a.similarity_score)
  return scored.slice(0, topN)
}
