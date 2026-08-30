/**
 * @fileoverview CulinaryFeed Ranking Engine — Phase 4, Pass 1
 * (Smarter Ranking pass: multi-dimensional scoring, UCB1 exploration,
 * diversity constraint)
 *
 * Candidate Generation, Heuristic Scoring, and Feed Ranking.
 *
 * Takes the full recipe catalogue, the current user's multi-dimensional
 * affinity profile (see `affinityModel.generateUserAffinityVector`), and the
 * set of recipe IDs already seen (or explicitly dismissed) by the user, then
 * returns a ranked, diversity-constrained list of unseen candidates.
 *
 * Algorithm overview:
 *  1. Candidate Generation  — filter out already-seen/dismissed recipes.
 *  2. Heuristic Scoring     — assign a `predicted_score` to each candidate as
 *                             a weighted combination of cuisine, difficulty,
 *                             dietary, and content-tag affinity, plus a UCB1
 *                             exploration bonus.
 *  3. Sorting               — order candidates descending by score.
 *  4. Diversity Constraint  — re-sequence so no cuisine dominates any
 *                             sliding window of the final feed.
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps.
 *  - Fully defensive: null / empty inputs are handled gracefully.
 *  - Deterministic structure, near-deterministic scores — UCB1 makes
 *    exploration shrink as a cuisine becomes well-observed instead of
 *    staying uniformly noisy forever; a tiny residual jitter remains only as
 *    a tie-breaker.
 *
 * @module rankingEngine
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Relative weight of each affinity dimension in the combined base score.
 * Cuisine stays dominant — it's still the strongest, most reliable signal —
 * while difficulty/dietary/tag affinity meaningfully nudge the ranking
 * without ever being able to override it on their own (each dimension's
 * weights individually sum to ~1.0, same scale as cuisine's).
 */
const CUISINE_AFFINITY_WEIGHT = 1.0
const DIFFICULTY_AFFINITY_WEIGHT = 0.3
const DIETARY_AFFINITY_WEIGHT = 0.3
const TAG_AFFINITY_WEIGHT = 0.3

/**
 * UCB1 exploration coefficient ("C"). Replaces the old flat epsilon-greedy
 * noise: the bonus for a cuisine shrinks as `impressionCountByCuisine` for
 * it grows, so a well-understood user's feed gets calmer over time while a
 * barely-observed cuisine still gets a strong nudge — including cuisines
 * with zero impressions, which get the maximum possible bonus (this is what
 * replaces the old "category starvation" guard).
 */
const UCB_EXPLORATION_COEFFICIENT = 0.3

/**
 * Tiny residual random jitter kept purely as a tie-breaker so identical UCB1
 * scores don't freeze the feed into the exact same order every render.
 * Deliberately far smaller than the old flat epsilon (0.15) — UCB1 is doing
 * the real exploration work now.
 */
const RESIDUAL_JITTER = 0.01

/**
 * Diversity constraint: at most this many recipes from the same cuisine may
 * appear within any `DIVERSITY_WINDOW_SIZE`-sized run of the final feed.
 * Prevents an echo-chamber feed (e.g. five Italian recipes in a row for a
 * loyalist-type user) without discarding any candidate — everything still
 * appears, just re-sequenced.
 */
const DIVERSITY_WINDOW_SIZE = 5
const MAX_PER_CUISINE_PER_WINDOW = 2

// =============================================================================
// DIVERSITY CONSTRAINT — applyDiversityConstraint
// =============================================================================

/**
 * Re-sequences an already score-sorted candidate list so no cuisine appears
 * more than `MAX_PER_CUISINE_PER_WINDOW` times within any
 * `DIVERSITY_WINDOW_SIZE`-sized window of the output — without dropping any
 * candidate. Candidates are bucketed by cuisine (each bucket keeping its
 * relative score order), then greedily interleaved: at each output slot, the
 * highest-scoring remaining candidate whose cuisine isn't already capped out
 * in the recent window is chosen.
 *
 * Escape hatch: if every remaining cuisine is currently capped out (possible
 * near the tail of the list, or when very few distinct cuisines remain), the
 * constraint relaxes for that one slot and the global next-highest remaining
 * candidate is placed instead — this is deliberate, so the pass can never
 * drop items or loop forever.
 *
 * @param {object[]} sortedCandidates - Candidates already sorted descending
 *   by `predicted_score`, each with a `cuisine_id` (may be null/undefined).
 * @returns {object[]} The same candidates, re-sequenced.
 */
function applyDiversityConstraint(sortedCandidates) {
  if (sortedCandidates.length <= DIVERSITY_WINDOW_SIZE) {
    return sortedCandidates
  }

  // ── Bucket by cuisine, preserving each bucket's relative score order ───────
  /** @type {Map<string, object[]>} */
  const buckets = new Map()
  for (const candidate of sortedCandidates) {
    const cuisineId = candidate?.cuisine_id ?? '__unknown__'
    if (!buckets.has(cuisineId)) buckets.set(cuisineId, [])
    buckets.get(cuisineId).push(candidate)
  }

  /** @type {Map<string, number>} Per-cuisine read pointer into its bucket. */
  const pointers = new Map([...buckets.keys()].map((id) => [id, 0]))

  /** Cuisine IDs of the last (DIVERSITY_WINDOW_SIZE - 1) placed items. */
  const recentWindow = []

  function countInWindow(cuisineId) {
    return recentWindow.filter((id) => id === cuisineId).length
  }

  function remainingCount() {
    let total = 0
    for (const [id, arr] of buckets) total += arr.length - pointers.get(id)
    return total
  }

  const output = []

  while (remainingCount() > 0) {
    // Cuisines with candidates left, ranked by their next candidate's score.
    const eligible = [...buckets.entries()]
      .filter(([id, arr]) => pointers.get(id) < arr.length)
      .sort((a, b) => {
        const scoreA = a[1][pointers.get(a[0])].predicted_score
        const scoreB = b[1][pointers.get(b[0])].predicted_score
        return scoreB - scoreA
      })

    let chosenCuisineId = null
    for (const [id] of eligible) {
      if (countInWindow(id) < MAX_PER_CUISINE_PER_WINDOW) {
        chosenCuisineId = id
        break
      }
    }

    // Escape hatch — see docstring above.
    if (chosenCuisineId === null) {
      chosenCuisineId = eligible[0][0]
    }

    const bucket = buckets.get(chosenCuisineId)
    const idx = pointers.get(chosenCuisineId)
    output.push(bucket[idx])
    pointers.set(chosenCuisineId, idx + 1)

    recentWindow.push(chosenCuisineId)
    if (recentWindow.length > DIVERSITY_WINDOW_SIZE - 1) {
      recentWindow.shift()
    }
  }

  return output
}

// =============================================================================
// MAIN EXPORT — generateRankedFeed
// =============================================================================

/**
 * Generates a ranked, diversity-constrained feed of unseen recipe candidates
 * for the current user.
 *
 * @param {object[]} catalog          - Full recipe catalogue (array of recipe
 *                                      objects). Each recipe must have
 *                                      `recipe_id` and `cuisine_id`.
 * @param {{
 *   cuisine: Record<string, number>,
 *   difficulty: Record<string, number>,
 *   dietary: Record<string, number>,
 *   tags: Record<string, number>,
 *   meta?: { impressionCountByCuisine?: Record<string, number>, totalImpressions?: number },
 * }} affinityProfile - The multi-dimensional profile produced by
 *   `affinityModel.generateUserAffinityVector`. Each dimension is a
 *   normalized weight map; `meta` feeds the UCB1 exploration term.
 * @param {string[]} seenRecipeIds    - Array of `recipe_id` strings to
 *                                      exclude from candidate generation —
 *                                      already-seen recipes, and (per the
 *                                      caller, see `useFeedRanking.js`)
 *                                      explicitly dismissed ones, which
 *                                      should never resurface.
 *
 * @returns {object[]} Ranked array of recipe objects each augmented with a
 *                     `predicted_score` property. Returns an empty array if
 *                     no unseen candidates exist or `catalog` is invalid.
 */
export function generateRankedFeed(catalog, affinityProfile, seenRecipeIds) {
  // ── Defensive guards ──────────────────────────────────────────

  if (!Array.isArray(catalog) || catalog.length === 0) {
    return []
  }

  const safeProfile = (affinityProfile != null && typeof affinityProfile === 'object')
    ? affinityProfile
    : {}
  const cuisineWeights     = safeProfile.cuisine ?? {}
  const difficultyWeights  = safeProfile.difficulty ?? {}
  const dietaryWeights     = safeProfile.dietary ?? {}
  const tagWeights         = safeProfile.tags ?? {}
  const impressionCountByCuisine = safeProfile.meta?.impressionCountByCuisine ?? {}
  const totalImpressions   = safeProfile.meta?.totalImpressions ?? 0

  const safeSeenIds = Array.isArray(seenRecipeIds) ? seenRecipeIds : []

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
  // Base Score : a weighted sum across four affinity dimensions — cuisine
  //              (dominant), difficulty tier, dietary tags, and content
  //              tags. Dietary/tag scores sum across every matching tag the
  //              recipe carries (a recipe matching two liked tags scores
  //              higher than one matching only one).
  // UCB1 Bonus : shrinks as the recipe's cuisine becomes better-observed;
  //              a never-seen cuisine gets the maximum possible bonus.
  // Jitter     : negligible random tie-breaker only.

  const scored = candidates.map((recipe) => {
    const cuisineId = recipe?.cuisine_id ?? null
    const cuisineScore = cuisineId != null ? (cuisineWeights[cuisineId] ?? 0) : 0

    const difficultyTier = recipe?.difficulty_tier ?? null
    const difficultyScore = difficultyTier != null ? (difficultyWeights[difficultyTier] ?? 0) : 0

    const recipeDietaryTags = Array.isArray(recipe?.dietary_tags) ? recipe.dietary_tags : []
    const dietaryScore = recipeDietaryTags.reduce(
      (sum, tag) => sum + (dietaryWeights[tag] ?? 0),
      0
    )

    const recipeTags = Array.isArray(recipe?.tags) ? recipe.tags : []
    const tagScore = recipeTags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0)

    const baseScore =
      cuisineScore * CUISINE_AFFINITY_WEIGHT +
      difficultyScore * DIFFICULTY_AFFINITY_WEIGHT +
      dietaryScore * DIETARY_AFFINITY_WEIGHT +
      tagScore * TAG_AFFINITY_WEIGHT

    // UCB1: C * sqrt(ln(totalImpressions + 1) / (impressionsForThisCuisine + 1))
    const cuisineImpressions = cuisineId != null ? (impressionCountByCuisine[cuisineId] ?? 0) : 0
    const explorationBonus =
      UCB_EXPLORATION_COEFFICIENT *
      Math.sqrt(Math.log(totalImpressions + 1) / (cuisineImpressions + 1))

    const residualJitter = Math.random() * RESIDUAL_JITTER

    const predicted_score = baseScore + explorationBonus + residualJitter

    // Return a shallow copy of the recipe augmented with predicted_score.
    // Spread avoids mutating the original catalogue objects.
    return { ...recipe, predicted_score }
  })

  // ── Step 3: Sort descending by predicted_score ─────────────────────────────

  scored.sort((a, b) => b.predicted_score - a.predicted_score)

  // ── Step 4: Diversity Constraint ────────────────────────────────────────────

  return applyDiversityConstraint(scored)
}
