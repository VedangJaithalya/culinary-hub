/**
 * @fileoverview CulinaryFeed Ranking Engine — Phase 4, Pass 1
 *
 * Candidate Generation, Heuristic Scoring, and Feed Ranking.
 *
 * Takes the full recipe catalogue, the current user affinity vector, and the
 * set of recipe IDs already seen by the user, then returns a ranked list of
 * unseen candidates ordered by predicted engagement.
 *
 * Algorithm overview:
 *  1. Candidate Generation  — filter out already-seen recipes.
 *  2. Heuristic Scoring     — assign a `predicted_score` to each candidate
 *                             using the affinity vector plus epsilon-greedy noise.
 *  3. Sorting               — return candidates sorted descending by score.
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps.
 *  - Fully defensive: null / empty inputs are handled gracefully.
 *  - Deterministic structure, non-deterministic scores (by design — exploration
 *    noise ensures different orderings each call to prevent echo chambers).
 *
 * @module rankingEngine
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/** Lower bound of the epsilon-greedy exploration multiplier (inclusive). */
const EXPLORATION_MIN = 0.9

/** Upper bound of the epsilon-greedy exploration multiplier (exclusive). */
const EXPLORATION_MAX = 1.1

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Generates a random float uniformly distributed in [min, max).
 *
 * @param {number} min - Lower bound (inclusive).
 * @param {number} max - Upper bound (exclusive).
 * @returns {number}
 */
function randomInRange(min, max) {
  return min + Math.random() * (max - min)
}

// =============================================================================
// MAIN EXPORT — generateRankedFeed
// =============================================================================

/**
 * Generates a ranked feed of unseen recipe candidates for the current user.
 *
 * @param {object[]} catalog         - Full recipe catalogue (array of recipe objects).
 *                                     Each recipe must have `recipe_id` and `cuisine_id`.
 * @param {Record<string, number>}   affinityVector - Normalized cuisine-to-weight map
 *                                     produced by `generateUserAffinityVector`.
 *                                     Weights should sum to ~1.0.
 * @param {string[]}  seenRecipeIds  - Array of `recipe_id` strings the user has
 *                                     already been shown (impression-based exclusion).
 *
 * @returns {object[]} Ranked array of recipe objects each augmented with a
 *                     `predicted_score` property, sorted descending by score.
 *                     Returns an empty array if no unseen candidates exist or
 *                     if `catalog` is not a valid array.
 */
export function generateRankedFeed(catalog, affinityVector, seenRecipeIds) {
  // ── Defensive guards ───────────────────────────────────────────────────────

  if (!Array.isArray(catalog) || catalog.length === 0) {
    return []
  }

  const safeAffinity = (affinityVector != null && typeof affinityVector === 'object')
    ? affinityVector
    : {}
  const safeSeenIds = Array.isArray(seenRecipeIds) ? seenRecipeIds : []

  // Pre-compute the cold-start base score once so we don't repeat the division
  // inside the map loop.
  const coldStartBase = 1.0 / catalog.length

  // ── Step 1: Candidate Generation ──────────────────────────────────────────
  // Build a Set for O(1) lookups rather than O(n) .includes() per candidate.

  /** @type {Set<string>} */
  const seenSet = new Set(safeSeenIds)

  const candidates = catalog.filter(
    (recipe) => recipe?.recipe_id != null && !seenSet.has(recipe.recipe_id)
  )

  if (candidates.length === 0) {
    return []
  }

  // ── Step 2: Heuristic Scoring ──────────────────────────────────────────────
  //
  // Base Score        : affinity weight for the recipe's cuisine, or the cold-
  //                     start uniform score if the cuisine is not yet ranked.
  // Exploration Factor: epsilon-greedy uniform noise in [0.9, 1.1) — prevents
  //                     the feed from collapsing into a deterministic echo
  //                     chamber by adding controlled randomness each call.

  const scored = candidates.map((recipe) => {
    const cuisineId = recipe?.cuisine_id

    // Look up the cuisine weight; fall back to cold-start base score.
    const baseScore =
      cuisineId != null && cuisineId in safeAffinity
        ? safeAffinity[cuisineId]
        : coldStartBase

    // Epsilon-greedy exploration noise
    const explorationFactor = randomInRange(EXPLORATION_MIN, EXPLORATION_MAX)
    const predicted_score   = baseScore * explorationFactor

    // Return a shallow copy of the recipe augmented with predicted_score.
    // Spread avoids mutating the original catalogue objects.
    return { ...recipe, predicted_score }
  })

  // ── Step 3: Sort descending by predicted_score ─────────────────────────────

  scored.sort((a, b) => b.predicted_score - a.predicted_score)

  return scored
}
