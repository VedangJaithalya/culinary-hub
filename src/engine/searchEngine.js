/**
 * @fileoverview searchEngine — recipe search and filtering.
 *
 * Product/UX: "Search and filters (cuisine, difficulty, dietary, max time) —
 * there's currently no way to find a recipe other than scrolling the feed."
 *
 * Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps, no
 * localStorage/DOM access — so it's trivially unit-testable and reusable
 * from both the search overlay and (in principle) any future surface.
 *
 * @module searchEngine
 */

import { DIFFICULTY_TIERS } from '../data/dataContracts.js'

/** Canonical difficulty filter order, easiest to hardest. */
export const DIFFICULTY_FILTER_ORDER = [
  DIFFICULTY_TIERS.EASY,
  DIFFICULTY_TIERS.INTERMEDIATE,
  DIFFICULTY_TIERS.ADVANCED,
]

/**
 * Formats a cuisine_id / tag slug into a human-readable label,
 * e.g. 'north_indian' -> 'North Indian', 'gluten-free' -> 'Gluten Free'.
 * @param {string} slug
 * @returns {string}
 */
export function formatSlugLabel(slug) {
  if (!slug) return ''
  return slug.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Enumerates the distinct cuisine_id values present in a recipe catalog,
 * sorted alphabetically by display label.
 *
 * @param {object[]} catalog
 * @returns {string[]}
 */
export function getAvailableCuisines(catalog) {
  if (!Array.isArray(catalog)) return []
  const ids = [...new Set(catalog.map((r) => r?.cuisine_id).filter(Boolean))]
  return ids.sort((a, b) => formatSlugLabel(a).localeCompare(formatSlugLabel(b)))
}

/**
 * Enumerates the distinct dietary_tags values present in a recipe catalog,
 * sorted alphabetically by display label.
 *
 * @param {object[]} catalog
 * @returns {string[]}
 */
export function getAvailableDietaryTags(catalog) {
  if (!Array.isArray(catalog)) return []
  const ids = new Set()
  for (const recipe of catalog) {
    for (const tag of recipe?.dietary_tags ?? []) ids.add(tag)
  }
  return [...ids].sort((a, b) => formatSlugLabel(a).localeCompare(formatSlugLabel(b)))
}

/**
 * Returns true if `recipe`'s searchable text (title, cuisine, tags,
 * description) contains `query` as a case-insensitive substring match on
 * any field. An empty/blank query always matches.
 *
 * @param {object} recipe
 * @param {string} query
 * @returns {boolean}
 */
function matchesQuery(recipe, query) {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true

  const haystacks = [
    recipe?.title,
    recipe?.cuisine_id,
    recipe?.description,
    ...(Array.isArray(recipe?.tags) ? recipe.tags : []),
    ...(Array.isArray(recipe?.dietary_tags) ? recipe.dietary_tags : []),
  ]

  return haystacks.some(
    (field) => typeof field === 'string' && field.toLowerCase().includes(trimmed)
  )
}

/**
 * @typedef {object} SearchFilters
 * @property {string}   [query]                 Free-text search string.
 * @property {string[]} [cuisines]               cuisine_id allow-list. Empty/omitted = all.
 * @property {string[]} [difficulties]           difficulty_tier allow-list. Empty/omitted = all.
 * @property {string[]} [dietaryTags]             Recipe must have ALL of these dietary_tags.
 * @property {number|null} [maxTotalTimeMinutes]  Recipe's total_time_minutes must be <= this.
 */

/**
 * Filters (and lightly ranks) a recipe catalog against free-text search and
 * structured filters. All criteria are ANDed together; an empty/default
 * value for any single criterion means "don't filter on this".
 *
 * Ranking: recipes whose title starts with the query sort first, then by
 * average_rating descending — a query is present. With no query, results
 * keep catalog order but still fall back to average_rating descending so
 * "browse by filter only" (e.g. just tapping 'Vegan') surfaces the best
 * recipes first.
 *
 * @param {object[]} catalog
 * @param {SearchFilters} filters
 * @returns {object[]} The filtered (and ranked) recipe list. Never mutates `catalog`.
 */
export function searchAndFilterRecipes(catalog, filters = {}) {
  if (!Array.isArray(catalog)) return []

  const {
    query = '',
    cuisines = [],
    difficulties = [],
    dietaryTags = [],
    maxTotalTimeMinutes = null,
  } = filters

  const cuisineSet = new Set(cuisines)
  const difficultySet = new Set(difficulties)

  const results = catalog.filter((recipe) => {
    if (!recipe) return false
    if (!matchesQuery(recipe, query)) return false

    if (cuisineSet.size > 0 && !cuisineSet.has(recipe.cuisine_id)) return false
    if (difficultySet.size > 0 && !difficultySet.has(recipe.difficulty_tier)) return false

    if (dietaryTags.length > 0) {
      const recipeDietary = new Set(recipe.dietary_tags ?? [])
      const satisfiesAll = dietaryTags.every((tag) => recipeDietary.has(tag))
      if (!satisfiesAll) return false
    }

    if (typeof maxTotalTimeMinutes === 'number') {
      const total = recipe.total_time_minutes ?? Infinity
      if (total > maxTotalTimeMinutes) return false
    }

    return true
  })

  const trimmedQuery = query.trim().toLowerCase()

  return results
    .map((recipe, originalIndex) => ({ recipe, originalIndex }))
    .sort((a, b) => {
      if (trimmedQuery) {
        const aStarts = a.recipe.title?.toLowerCase().startsWith(trimmedQuery) ? 1 : 0
        const bStarts = b.recipe.title?.toLowerCase().startsWith(trimmedQuery) ? 1 : 0
        if (aStarts !== bStarts) return bStarts - aStarts
      }

      const aRating = a.recipe.average_rating ?? 0
      const bRating = b.recipe.average_rating ?? 0
      if (aRating !== bRating) return bRating - aRating

      return a.originalIndex - b.originalIndex
    })
    .map(({ recipe }) => recipe)
}
