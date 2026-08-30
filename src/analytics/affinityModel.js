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
// SCORE COMPONENTS — calculateImpressionScore
// =============================================================================

/**
 * Computes a single composite engagement score for one impression row.
 *
 * Score components:
 *  - Dwell Score    : linear up to 10 s, capped at 2.0
 *  - Expand Score   : flat 2.5 bonus when the card was expanded
 *  - Prep Score     : 0–3.0 proportional to fraction of ingredients checked
 *  - Skip Penalty   : −1.5 when the impression was flagged as skipped
 *
 * @param {{ dwell_time_ms: number, is_expanded: boolean,
 *            ingredients_checked_count: number, is_skipped: boolean }} impression
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

  return dwellScore + expandScore + prepScore + skipPenalty + saveModifier + likeModifier
}

// =============================================================================
// VECTOR GENERATION — generateUserAffinityVector
// =============================================================================

/**
 * Builds and normalizes a cuisine affinity vector from the current session data.
 *
 * Steps:
 *  1. Load impressions from the latest analytics snapshot.
 *  2. Enumerate every unique `cuisine_id` across all known recipes.
 *  3. Accumulate raw engagement scores per cuisine from matched impressions.
 *  4. Floor negative totals to 0, then normalize to a probability distribution.
 *  5. Return a plain object mapping each `cuisine_id` to a normalized weight (4 dp).
 *
 * Cold-start: if no positive scores exist, return a uniform distribution.
 *
 * @returns {Record<string, number>}
 */
/**
 * Builds the cold-start affinity vector used when a user has no positive
 * engagement signal yet (brand new, or every impression scored <= 0).
 *
 * If the user completed onboarding and picked at least one preferred
 * cuisine (that still exists in the current catalogue), 70% of the
 * probability mass is split evenly across those preferred cuisines and the
 * remaining 30% is split evenly across every other cuisine — a soft prior,
 * not an exclusion, so the ranking engine's existing epsilon-greedy
 * exploration can still surface anything. With no profile or no usable
 * preferences, this degrades exactly to the original flat uniform
 * distribution.
 *
 * @param {string[]} cuisineIds  Every distinct cuisine_id in the catalogue.
 * @returns {Record<string, number>}
 */
function buildColdStartVector(cuisineIds) {
  if (cuisineIds.length === 0) return {}

  const profile = getUserProfile()
  const preferred = (profile?.preferredCuisines ?? []).filter((id) => cuisineIds.includes(id))

  if (preferred.length === 0) {
    const equalWeight = parseFloat((1 / cuisineIds.length).toFixed(4))
    return Object.fromEntries(cuisineIds.map((id) => [id, equalWeight]))
  }

  const PREFERRED_MASS = 0.7
  const preferredWeight = PREFERRED_MASS / preferred.length
  const others = cuisineIds.filter((id) => !preferred.includes(id))
  const otherWeight = others.length > 0 ? (1 - PREFERRED_MASS) / others.length : 0

  return Object.fromEntries(
    cuisineIds.map((id) => [
      id,
      parseFloat((preferred.includes(id) ? preferredWeight : otherWeight).toFixed(4)),
    ])
  )
}

export function generateUserAffinityVector() {
  const { impressions } = getLatestAnalyticsData()

  // ── Step 1: Enumerate all cuisine_ids from the recipe catalogue ─────────────
  const cuisineIds = [
    ...new Set(
      mockRecipes
        .map((r) => r.cuisine_id)
        .filter((id) => id != null && id !== '')
    ),
  ]

  // ── Step 2: Initialize raw score dictionary at 0 for every cuisine ──────────
  /** @type {Record<string, number>} */
  const rawScores = Object.fromEntries(cuisineIds.map((id) => [id, 0]))

  // ── Step 3: Accumulate scores from impressions ──────────────────────────────
  for (const impression of impressions) {
    const recipe = recipeById.get(impression.recipe_id)
    if (!recipe) continue // recipe not found in catalogue — skip defensively

    const cuisineId = recipe.cuisine_id
    if (!cuisineId || !(cuisineId in rawScores)) continue

    rawScores[cuisineId] += calculateImpressionScore(impression, recipe)
  }

  // ── Step 4: Apply floor of 0 to each raw score ─────────────────────────────
  const floored = Object.fromEntries(
    Object.entries(rawScores).map(([id, score]) => [id, Math.max(0, score)])
  )

  // ── Step 5: Sum all floored scores ─────────────────────────────────────────
  const totalPositiveScore = Object.values(floored).reduce((sum, s) => sum + s, 0)

  // ── Step 6: Cold-start guard ─────────────────────────────────────────────
  // With zero engagement history we used to fall back to a flat uniform
  // distribution for every brand-new user. Now, if the user completed the
  // onboarding survey (see userProfileService.js / OnboardingModal.jsx), we
  // lean the cold-start vector toward their stated `preferredCuisines`
  // instead — so a new user's very first feed already reflects what they
  // told us, rather than waiting for engagement to accumulate. Falls back
  // to the original uniform distribution when no profile/preferences exist,
  // so existing (pre-onboarding) behaviour is unchanged.
  if (totalPositiveScore === 0) {
    return buildColdStartVector(cuisineIds)
  }

  // ── Step 7: Normalize to probability distribution (4 decimal places) ────────
  return Object.fromEntries(
    Object.entries(floored).map(([id, score]) => [
      id,
      parseFloat((score / totalPositiveScore).toFixed(4)),
    ])
  )
}

// =============================================================================
// VALIDATION — debugPrintAffinity
// =============================================================================

/**
 * Prints the normalized cuisine affinity vector to the browser console using
 * a grouped, tabular layout. Intended for manual QA and developer debugging.
 *
 * Usage (browser DevTools console):
 *   debugAffinity()
 */
export function debugPrintAffinity() {
  const vector = generateUserAffinityVector()

  // Convert to an array of row objects for clean console.table rendering
  const rows = Object.entries(vector).map(([cuisine_id, weight]) => ({
    cuisine_id,
    weight,
  }))

  console.group('CulinaryFeed Affinity Vector')
  console.table(rows)
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
