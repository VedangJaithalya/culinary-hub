/**
 * @fileoverview shareService — recipe share/export.
 *
 * Product/UX: "Share/export a single recipe as a link or PDF."
 *
 * There's no backend/routing, so a "share link" is a same-page deep link
 * (`?recipe=<recipe_id>` on the app's own URL) rather than a server-hosted
 * permalink; `App.jsx` reads that query param on load to jump straight into
 * the shared recipe. `shareRecipe` prefers the native Web Share API (best
 * on mobile — opens the OS share sheet) and falls back to copying the link
 * to the clipboard when the API is unavailable or the user cancels a share
 * that never actually completed.
 *
 * @module shareService
 */

import { dispatchTelemetry } from './telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'

/**
 * Builds a shareable deep link for a recipe: the app's own URL (origin +
 * path, dropping any existing query/hash) with `?recipe=<recipe_id>`.
 *
 * @param {string} recipeId
 * @returns {string}
 */
export function buildRecipeShareUrl(recipeId) {
  if (typeof window === 'undefined') return ''
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}?recipe=${encodeURIComponent(recipeId)}`
}

/**
 * Shares a recipe via the native share sheet (Web Share API) when
 * available, otherwise copies the share link to the clipboard. Always
 * dispatches EVENT_TYPES.RECIPE_SHARE with the method actually used —
 * except when the user explicitly cancels the native share sheet, which is
 * not a share and isn't tracked.
 *
 * @param {{ recipe_id: string, title: string, description?: string }} recipe
 * @returns {Promise<{ method: 'native'|'clipboard'|'failed', url: string }>}
 */
export async function shareRecipe(recipe) {
  const url = buildRecipeShareUrl(recipe.recipe_id)
  const shareData = {
    title: recipe.title,
    text: recipe.description ? `${recipe.title} — ${recipe.description}` : recipe.title,
    url,
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData)
      dispatchTelemetry(EVENT_TYPES.RECIPE_SHARE, { recipe_id: recipe.recipe_id, method: 'native' })
      return { method: 'native', url }
    } catch (err) {
      // AbortError = user cancelled the share sheet — not a failure worth
      // falling back for or logging as an error.
      if (err?.name === 'AbortError') {
        return { method: 'native', url }
      }
      // Any other native-share error falls through to the clipboard path.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url)
      dispatchTelemetry(EVENT_TYPES.RECIPE_SHARE, { recipe_id: recipe.recipe_id, method: 'clipboard' })
      return { method: 'clipboard', url }
    } catch {
      // Clipboard API blocked (permissions, insecure context) — fall through.
    }
  }

  return { method: 'failed', url }
}
