/**
 * @fileoverview CulinaryFeed Affinity Model — Phase 3, Pass 2
 *
 * User Affinity Scoring & Vector Normalization.
 *
 * Consumes the `fact_feed_impressions` output produced by `sessionTransformer`
 * and computes a normalized cuisine affinity vector for the current user.
 *
 * The vector is a probability distribution over all known `cuisine_id`s:
 *  - Each entry reflects how strongly the user's engagement signals favour
 *    that cuisine relative to others.
 *  - Entries sum to 1.0 (within floating-point rounding tolerance).
 *  - Cold-start / no-data case returns a uniform distribution.
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps.
 *  - Fully defensive: missing recipe, null cuisine_id, or zero totals are all
 *    handled without throwing.
 *  - Idempotent: calling any exported function on the same localStorage state
 *    always returns the same output.
 *
 * @module affinityModel
 */

import { getLatestAnalyticsData } from './sessionTransformer.js'
import mockRecipes from '../data/mockRecipes.json'
import { getUserProfile } from '../services/userProfileService.js'

// =============================================================================
// MODULE-LEVEL LOOKUP TABLE
// Pre-index mockRecipes by recipe_id so per-impression lookups are O(1).
// =============================================================================

/** @type {Map<string, object>} */
const recipeById = new Map(mockRecipes.map((r) => [r.recipe_id, r]))

// =============================================================================
// RECENCY DECAY
// =============================================================================

/**
 * Half-life (in days) for time-decaying engagement signal. A like from
 * exactly this many days ago contributes half the weight of one from right
 * now; two half-lives ago contributes a quarter, and so on. Chosen so taste
 * drift (see usr_fake_17_drifting_taste) becomes visible across a few weeks
 * of sessions without old signal vanishing instantly.
 *
 * @type {number}
 */
const AFFINITY_HALF_LIFE_DAYS = 14

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Computes an exponential recency-decay multiplier in (0, 1] for a single
 * impression, based on the most recent event timestamp recorded against it
 * by `sessionTransformer` (`last_event_ts_ms`).
 *
 * Missing/malformed timestamps (e.g. older or hand-authored fixtures that
 * predate this field) default to a multiplier of 1 — treated as fully
 * recent — so this degrades safely rather than zeroing out legacy data.
 *
 * @param {number|null|undefined} lastEventTsMs
 * @returns {number}
 */
function calculateRecencyDecay(lastEventTsMs) {
  if (typeof lastEventTsMs !== 'number' || !Number.isFinite(lastEventTsMs)) {
    return 1
  }

  const ageMs = Date.now() - lastEventTsMs
  if (ageMs <= 0) return 1 // clock skew / future timestamp guard

  const ageDays = ageMs / MS_PER_DAY
  return Math.pow(0.5, ageDays / AFFINITY_HALF_LIFE_DAYS)
}

// =============================================================================
// SCORE COMPONENTS — calculateImpressionScore
// =============================================================================

/**
 * Computes a single composite engagement score for one impression row.
 *
 * Score components:
 *  - Dwell Score       : linear up to 10 s, capped at 2.0
 *  - Expand Score      : flat 2.5 bonus when the card was expanded
 *  - Prep Score        : 0–3.0 proportional to fraction of ingredients checked
 *  - Skip Penalty      : −1.5 when the impression was flagged as skipped
 *  - Dismiss Penalty   : −6.0 when the user explicitly marked "not interested" —
 *                        deliberately the single largest-magnitude term (bigger
 *                        than the +4.5 save bonus) since an explicit dismissal
 *                        is higher-confidence signal than anything else scored
 *                        here, implicit or explicit.
 *
 * @param {{ dwell_time_ms: number, is_expanded: boolean,
 *            ingredients_checked_count: number, is_skipped: boolean,
 *            is_dismissed?: boolean }} impression
 * @param {{ ingredients: Array<unknown> }} recipe
 * @returns {number}
 */
export function calculateImpressionScore(impression, recipe) {
  // ── Dwell Score ────────────────────────────────────────────────────────────
  const dwellScore = Math.min((impression.dwell_time_ms ?? 0) / 10000, 2.0)

  // ── Expand Score ───────────────────────────────────────────────────────────
  const expandScore = impression.is_expanded ? 2.5 : 0

  // ── Prep Score ─────────────────────────────────────────────────────────────
  const totalIngredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.length
    : 0
  const ratio =
    totalIngredients > 0
      ? (impression.ingredients_checked_count ?? 0) / totalIngredients
      : 0
  const prepScore = 3.0 * ratio

  // ── Skip Penalty ───────────────────────────────────────────────────────────
  const skipPenalty = impression.is_skipped ? -1.5 : 0

  // ── Explicit Interaction Modifiers ─────────────────────────────────────────
  const saveModifier = impression.is_saved ? 4.5 : 0
  const likeModifier = impression.is_liked ? 3.5 : 0

  // ── Explicit Negative Modifier ──────────────────────────────────────────────
  // A real "not interested" tap, not an inferred skip. See dismissService.js.
  const dismissModifier = impression.is_dismissed ? -6.0 : 0

  return dwellScore + expandScore + prepScore + skipPenalty + saveModifier + likeModifier + dismissModifier
}

// =============================================================================
// DIMENSION HELPERS
// =============================================================================

/**
 * Extractor functions for each affinity dimension: given a recipe, returns
 * the array of dimension values it belongs to (empty if none). Cuisine and
 * difficulty are single-valued; dietary tags and content tags are
 * multi-valued, so one impression can contribute to several buckets within
 * those two dimensions.
 *
 * @type {Record<string, (recipe: object) => string[]>}
 */
const DIMENSION_EXTRACTORS = {
  cuisine: (r) => (r?.cuisine_id ? [r.cuisine_id] : []),
  difficulty: (r) => (r?.difficulty_tier ? [r.difficulty_tier] : []),
  dietary: (r) => (Array.isArray(r?.dietary_tags) ? r.dietary_tags.filter(Boolean) : []),
  tags: (r) => (Array.isArray(r?.tags) ? r.tags.filter(Boolean) : []),
}

/**
 * Enumerates every distinct value that appears for one dimension across the
 * full recipe catalogue. Driven entirely by live data rather than a fixed
 * enum (e.g. `DIFFICULTY_TIERS`), so it can never drift out of sync with
 * what `mockRecipes.json` actually contains.
 *
 * @param {(recipe: object) => string[]} extractor
 * @returns {string[]}
 */
function enumerateDimensionValues(extractor) {
  const values = new Set()
  for (const recipe of mockRecipes) {
    for (const value of extractor(recipe)) values.add(value)
  }
  return [...values]
}

/**
 * Floors every raw score at 0, then normalizes the survivors to a
 * probability distribution (4 decimal places).
 *
 * @param {Record<string, number>} rawScores
 * @returns {{ weights: Record<string, number>, total: number }}
 *   `total` is the pre-normalization sum, so callers can detect the
 *   cold-start case (`total === 0`) without re-summing.
 */
function floorAndNormalize(rawScores) {
  const floored = Object.fromEntries(
    Object.entries(rawScores).map(([key, score]) => [key, Math.max(0, score)])
  )
  const total = Object.values(floored).reduce((sum, s) => sum + s, 0)

  if (total === 0) {
    return { weights: {}, total: 0 }
  }

  const weights = Object.fromEntries(
    Object.entries(floored).map(([key, score]) => [key, parseFloat((score / total).toFixed(4))])
  )
  return { weights, total }
}

/**
 * Splits probability mass between a "preferred" subset of values and
 * everything else — the shared cold-start shape used by cuisine
 * (`preferredCuisines`), difficulty (mapped from `skillLevel`), and dietary
 * (`dietaryFlags`). A soft prior, not an exclusion, so exploration can still
 * surface anything. Degrades to flat uniform with no usable preferences.
 *
 * @param {string[]} allValues
 * @param {string[]} preferredValues
 * @param {number} [preferredMass=0.7]
 * @returns {Record<string, number>}
 */
function buildPreferenceWeightedDistribution(allValues, preferredValues, preferredMass = 0.7) {
  if (allValues.length === 0) return {}

  const preferred = preferredValues.filter((v) => allValues.includes(v))

  if (preferred.length === 0) {
    const equalWeight = parseFloat((1 / allValues.length).toFixed(4))
    return Object.fromEntries(allValues.map((v) => [v, equalWeight]))
  }

  const preferredWeight = preferredMass / preferred.length
  const others = allValues.filter((v) => !preferred.includes(v))
  const otherWeight = others.length > 0 ? (1 - preferredMass) / others.length : 0

  return Object.fromEntries(
    allValues.map((v) => [
      v,
      parseFloat((preferred.includes(v) ? preferredWeight : otherWeight).toFixed(4)),
    ])
  )
}

/**
 * Maps a self-declared onboarding `skillLevel` to the single closest
 * `difficulty_tier` value actually present in the catalogue. `professional`
 * has no dedicated tier in the current data, so it leans on the hardest tier
 * that exists rather than pointing at a bucket that's always empty.
 *
 * @type {Record<string, string>}
 */
const SKILL_LEVEL_TO_DIFFICULTY = Object.freeze({
  beginner: 'easy',
  intermediate: 'intermediate',
  advanced: 'advanced',
  professional: 'advanced',
})

// =============================================================================
// VECTOR GENERATION — generateUserAffinityVector
// =============================================================================

/**
 * Builds a multi-dimensional affinity profile from the current session data:
 * parallel probability distributions over `cuisine_id`, `difficulty_tier`,
 * each `dietary_tags` entry, and each `tags` entry — instead of cuisine
 * alone, which previously left dietary-driven or tag-driven users (vegan,
 * spice-chaser, breakfast-lover, etc.) almost undifferentiated.
 *
 * Each dimension is built identically: accumulate every impression's
 * recency-decayed `calculateImpressionScore` into every bucket the matched
 * recipe belongs to for that dimension, floor negative totals at 0, then
 * normalize (see `floorAndNormalize`). Also returns per-cuisine impression
 * counts, consumed by `rankingEngine`'s UCB1 exploration term — "how much
 * have we observed" is tracked unconditionally, independent of whether the
 * engagement was positive or negative.
 *
 * Cold start (zero net-positive cuisine signal) falls every dimension back
 * to its own onboarding-informed distribution together — see
 * `buildPreferenceWeightedDistribution` — rather than leaving some
 * dimensions cold-started and others not.
 *
 * @returns {{
 *   cuisine: Record<string, number>,
 *   difficulty: Record<string, number>,
 *   dietary: Record<string, number>,
 *   tags: Record<string, number>,
 *   meta: {
 *     impressionCountByCuisine: Record<string, number>,
 *     totalImpressions: number,
 *     isColdStart: boolean,
 *   },
 * }}
 */
export function generateUserAffinityVector() {
  const { impressions } = getLatestAnalyticsData()
  const profile = getUserProfile()

  const dimensionValues = {
    cuisine: enumerateDimensionValues(DIMENSION_EXTRACTORS.cuisine),
    difficulty: enumerateDimensionValues(DIMENSION_EXTRACTORS.difficulty),
    dietary: enumerateDimensionValues(DIMENSION_EXTRACTORS.dietary),
    tags: enumerateDimensionValues(DIMENSION_EXTRACTORS.tags),
  }

  const rawScores = {
    cuisine: Object.fromEntries(dimensionValues.cuisine.map((v) => [v, 0])),
    difficulty: Object.fromEntries(dimensionValues.difficulty.map((v) => [v, 0])),
    dietary: Object.fromEntries(dimensionValues.dietary.map((v) => [v, 0])),
    tags: Object.fromEntries(dimensionValues.tags.map((v) => [v, 0])),
  }

  // Raw (non-decayed, non-floored) per-cuisine impression counts — feeds
  // rankingEngine's UCB1 exploration term. "How much have we observed" is a
  // different question from "did the user like it".
  const impressionCountByCuisine = Object.fromEntries(dimensionValues.cuisine.map((v) => [v, 0]))
  let totalImpressions = 0

  for (const impression of impressions) {
    const recipe = recipeById.get(impression.recipe_id)
    if (!recipe) continue // recipe not found in catalogue — skip defensively

    const decay = calculateRecencyDecay(impression.last_event_ts_ms)
    const decayedScore = calculateImpressionScore(impression, recipe) * decay

    for (const [dimension, extractor] of Object.entries(DIMENSION_EXTRACTORS)) {
      for (const value of extractor(recipe)) {
        if (value in rawScores[dimension]) {
          rawScores[dimension][value] += decayedScore
        }
      }
    }

    if (recipe.cuisine_id && recipe.cuisine_id in impressionCountByCuisine) {
      impressionCountByCuisine[recipe.cuisine_id] += 1
      totalImpressions += 1
    }
  }

  const normalizedCuisine = floorAndNormalize(rawScores.cuisine)
  const normalizedDifficulty = floorAndNormalize(rawScores.difficulty)
  const normalizedDietary = floorAndNormalize(rawScores.dietary)
  const normalizedTags = floorAndNormalize(rawScores.tags)

  // Cold start is decided by the cuisine dimension, same signal as before.
  const isColdStart = normalizedCuisine.total === 0

  const cuisine = isColdStart
    ? buildPreferenceWeightedDistribution(dimensionValues.cuisine, profile?.preferredCuisines ?? [])
    : normalizedCuisine.weights

  const difficultyPreference = profile?.skillLevel
    ? [SKILL_LEVEL_TO_DIFFICULTY[profile.skillLevel]].filter(Boolean)
    : []
  const difficulty = isColdStart
    ? buildPreferenceWeightedDistribution(dimensionValues.difficulty, difficultyPreference)
    : normalizedDifficulty.weights

  const dietary = isColdStart
    ? buildPreferenceWeightedDistribution(dimensionValues.dietary, profile?.dietaryFlags ?? [])
    : normalizedDietary.weights

  // No onboarding signal exists for content tags — cold start is flat
  // uniform via the same helper with an empty preferred set.
  const tags = isColdStart
    ? buildPreferenceWeightedDistribution(dimensionValues.tags, [])
    : normalizedTags.weights

  return {
    cuisine,
    difficulty,
    dietary,
    tags,
    meta: { impressionCountByCuisine, totalImpressions, isColdStart },
  }
}

// =============================================================================
// VALIDATION — debugPrintAffinity
// =============================================================================

/**
 * Prints the full multi-dimensional affinity profile to the browser console
 * using grouped, tabular layouts — one table per dimension, each sorted
 * descending by weight, plus the cold-start/impression-count metadata.
 * Intended for manual QA and developer debugging.
 *
 * Usage (browser DevTools console):
 *   debugAffinity()
 */
export function debugPrintAffinity() {
  const profile = generateUserAffinityVector()

  console.group('CulinaryFeed Affinity Profile')
  console.log(`Cold start: ${profile.meta.isColdStart}`)
  console.log(`Total impressions counted: ${profile.meta.totalImpressions}`)

  for (const dimension of ['cuisine', 'difficulty', 'dietary', 'tags']) {
    const rows = Object.entries(profile[dimension])
      .sort((a, b) => b[1] - a[1])
      .map(([key, weight]) => ({ [dimension]: key, weight }))

    console.group(dimension)
    console.table(rows)
    console.groupEnd()
  }

  console.groupEnd()
}

// =============================================================================
// GLOBAL DEVTOOLS BINDING
// Attaches `window.debugAffinity` so any engineer can call it from the
// browser console without any imports.
// =============================================================================

if (typeof window !== 'undefined') {
  window.debugAffinity = debugPrintAffinity
}
