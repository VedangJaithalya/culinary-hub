/**
 * @fileoverview dismissService — explicit "not interested" persistence.
 *
 * The only negative signal the ranking engine had was an *inferred* skip
 * (short dwell, never expanded) — a weak, easy-to-misread signal. This module
 * lets a user say "not this" directly from the feed card, persists dismissed
 * recipe IDs in localStorage (mirroring the save/follow/rating services), and
 * dispatches RECIPE_DISMISS telemetry so `sessionTransformer`/`affinityModel`
 * can treat it as a strong, explicit negative — see `calculateImpressionScore`'s
 * `dismissModifier`.
 *
 * Dismissal is intentionally one-directional here (no "un-dismiss" affordance
 * in the UI yet) — a dismissed recipe should never resurface in the feed, not
 * just be down-ranked. `getDismissedRecipeIds()` is consumed by
 * `useFeedRanking.js` to permanently exclude these from candidate generation,
 * the same way already-seen recipe IDs are excluded.
 *
 * @module dismissService
 */

import { dispatchTelemetry } from './telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'

const DISMISSED_KEY = 'culinaryfeed_dismissed_recipes'

function readDismissedIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeDismissedIds(ids) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch {
    // localStorage unavailable — in-memory caller state still updates.
  }
}

/**
 * Returns every recipe_id the user has explicitly dismissed.
 * @returns {string[]}
 */
export function getDismissedRecipeIds() {
  return readDismissedIds()
}

/**
 * @param {string} recipeId
 * @returns {boolean}
 */
export function isDismissed(recipeId) {
  return readDismissedIds().includes(recipeId)
}

/**
 * Records an explicit "not interested" dismissal for a recipe: persists it
 * and dispatches RECIPE_DISMISS telemetry with the recipe's cuisine so
 * per-cuisine negative signal (e.g. an anti-fan of one cuisine) is directly
 * visible in the raw event stream, not just derivable after the fact.
 *
 * @param {{ recipe_id: string, cuisine_id?: string }} recipe
 * @returns {string[]} The updated list of dismissed recipe IDs.
 */
export function dismissRecipe(recipe) {
  const recipeId = recipe?.recipe_id
  if (!recipeId) return readDismissedIds()

  const current = readDismissedIds()
  const next = current.includes(recipeId) ? current : [...current, recipeId]
  writeDismissedIds(next)

  dispatchTelemetry(EVENT_TYPES.RECIPE_DISMISS, {
    recipe_id: recipeId,
    cuisine_id: recipe?.cuisine_id ?? null,
  })

  return next
}
