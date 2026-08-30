/**
 * @fileoverview ratingService — client-side rating overlay.
 *
 * There is no backend, so a submitted star rating can't actually update
 * `dim_recipe.average_rating` in a warehouse anywhere. Instead this module
 * keeps the user's own rating per recipe in localStorage and nudges the
 * recipe's static mock `average_rating` / `rating_count`, the same way one
 * new real rating would move a real aggregate, then persists that nudged
 * aggregate so it stays stable across reloads.
 *
 * @module ratingService
 */

import { dispatchTelemetry } from './telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'

const RATINGS_KEY = 'culinaryfeed_user_ratings'
const OVERLAY_KEY = 'culinaryfeed_rating_overlay'

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : fallback
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable — in-memory caller state still updates.
  }
}

/**
 * Returns the current user's own rating (1-5) for a recipe, or null.
 * @param {string} recipeId
 * @returns {number|null}
 */
export function getUserRating(recipeId) {
  const value = readJSON(RATINGS_KEY, {})[recipeId]
  return typeof value === 'number' ? value : null
}

/**
 * Returns the recipe's current display stats — the persisted nudged
 * aggregate if this user has ever rated it, otherwise the static mock
 * `average_rating` / `rating_count` from mockRecipes.json.
 *
 * @param {{ recipe_id: string, average_rating?: number, rating_count?: number }} recipe
 * @returns {{ averageRating: number, ratingCount: number, userRating: number|null }}
 */
export function getRatingStats(recipe) {
  const overlay = readJSON(OVERLAY_KEY, {})[recipe.recipe_id]
  const userRating = getUserRating(recipe.recipe_id)

  if (overlay) {
    return { averageRating: overlay.averageRating, ratingCount: overlay.ratingCount, userRating }
  }

  return {
    averageRating: recipe.average_rating ?? 0,
    ratingCount: recipe.rating_count ?? 0,
    userRating,
  }
}

/**
 * Submits (or updates) the current user's rating for a recipe.
 *
 * On first rating, the display average is nudged as if one new data point
 * were added: `newAvg = (avg * count + rating) / (count + 1)`. On a changed
 * rating, the previous contribution is removed first so the same user never
 * gets double-counted.
 *
 * @param {object} recipe        Full recipe object (needs recipe_id, average_rating, rating_count).
 * @param {number} ratingValue   Integer 1-5 (clamped).
 * @returns {{ averageRating: number, ratingCount: number, userRating: number }}
 */
export function submitRating(recipe, ratingValue) {
  const clamped = Math.min(5, Math.max(1, Math.round(ratingValue)))
  const { averageRating: currentAverage, ratingCount: currentCount, userRating: previousRating } =
    getRatingStats(recipe)

  let workingAverage = currentAverage
  let workingCount = currentCount

  if (previousRating != null && workingCount > 0) {
    const total = workingAverage * workingCount - previousRating
    workingCount -= 1
    workingAverage = workingCount > 0 ? total / workingCount : 0
  }

  const newCount = workingCount + 1
  const newAverage = (workingAverage * workingCount + clamped) / newCount

  const ratings = readJSON(RATINGS_KEY, {})
  ratings[recipe.recipe_id] = clamped
  writeJSON(RATINGS_KEY, ratings)

  const overlay = readJSON(OVERLAY_KEY, {})
  overlay[recipe.recipe_id] = { averageRating: newAverage, ratingCount: newCount }
  writeJSON(OVERLAY_KEY, overlay)

  dispatchTelemetry(EVENT_TYPES.RATING_SUBMIT, {
    recipe_id: recipe.recipe_id,
    rating_value: clamped,
    previous_rating_value: previousRating,
  })

  return { averageRating: newAverage, ratingCount: newCount, userRating: clamped }
}
