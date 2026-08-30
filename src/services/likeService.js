/**
 * @fileoverview likeService — recipe like persistence.
 *
 * FeedCard tracked `isLiked` as plain in-memory `useState(false)` state with
 * no localStorage backing, unlike `isSaved` (which reads
 * `culinaryfeed_saved_recipes` on init). That meant a liked recipe's heart
 * silently reset to unfilled on every page reload even though a RECIPE_LIKE
 * telemetry event had already fired — inconsistent with the save button
 * right next to it. This module mirrors the save/dismiss/follow pattern so
 * likes persist the same way saves do.
 *
 * @module likeService
 */

const LIKED_KEY = 'culinaryfeed_liked_recipes'

function readLikedIds() {
  try {
    const raw = localStorage.getItem(LIKED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLikedIds(ids) {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify(ids))
  } catch {
    // localStorage unavailable — in-memory caller state still updates.
  }
}

/**
 * @param {string} recipeId
 * @returns {boolean}
 */
export function isLikedRecipe(recipeId) {
  if (!recipeId) return false
  return readLikedIds().includes(recipeId)
}

/**
 * Persists the liked state for a recipe. Does not dispatch telemetry itself —
 * callers (FeedCard) already dispatch EVENT_TYPES.RECIPE_LIKE alongside this,
 * matching the existing save-button call site convention.
 *
 * @param {string} recipeId
 * @param {boolean} nextLiked
 */
export function setLikedRecipe(recipeId, nextLiked) {
  if (!recipeId) return
  const current = readLikedIds()
  const next = nextLiked
    ? [...new Set([...current, recipeId])]
    : current.filter((id) => id !== recipeId)
  writeLikedIds(next)
}
