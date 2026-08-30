/**
 * @fileoverview cookService — Cook Mode telemetry + local cook-count overlay.
 *
 * Every recipe step already carries a `duration_estimate_seconds`, but
 * nothing in the app used it. This module backs the step-by-step Cook Mode
 * view: it dispatches RECIPE_COOK_START on entry and RECIPE_COOK_COMPLETE
 * when the user finishes the last step, and keeps a local "cooked N times"
 * overlay (there's no backend to persist `dim_recipe.cook_count` centrally).
 *
 * @module cookService
 */

import { dispatchTelemetry } from './telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'

const COOKED_KEY = 'culinaryfeed_user_cooked'

function readCookedCounts() {
  try {
    const raw = localStorage.getItem(COOKED_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCookedCounts(counts) {
  try {
    localStorage.setItem(COOKED_KEY, JSON.stringify(counts))
  } catch {
    // noop
  }
}

/**
 * Dispatches RECIPE_COOK_START. Call once when Cook Mode opens.
 * @param {string} recipeId
 */
export function startCookMode(recipeId) {
  dispatchTelemetry(EVENT_TYPES.RECIPE_COOK_START, { recipe_id: recipeId })
}

/**
 * Dispatches RECIPE_COOK_COMPLETE and increments the local cook-count
 * overlay for this recipe. Call once when the user finishes the final step.
 *
 * @param {string} recipeId
 * @param {number} totalSteps
 * @returns {number} The recipe's new locally-tracked cook count delta (times
 *   completed via Cook Mode on this device — not the full display count).
 */
export function completeCookMode(recipeId, totalSteps) {
  const counts = readCookedCounts()
  const next = (counts[recipeId] ?? 0) + 1
  counts[recipeId] = next
  writeCookedCounts(counts)

  dispatchTelemetry(EVENT_TYPES.RECIPE_COOK_COMPLETE, {
    recipe_id: recipeId,
    total_steps: totalSteps,
  })

  return next
}

/**
 * Returns the recipe's display cook count: the static mock `cook_count`
 * plus however many times this user has completed Cook Mode locally.
 *
 * @param {{ recipe_id: string, cook_count?: number }} recipe
 * @returns {number}
 */
export function getDisplayCookCount(recipe) {
  const base = recipe.cook_count ?? 0
  const local = readCookedCounts()[recipe.recipe_id] ?? 0
  return base + local
}
