/**
 * @fileoverview shoppingListService — cross-recipe shopping list.
 *
 * Ingredient checking already exists inside a single recipe's modal
 * (INGREDIENT_INTERACTION), but there was no way to collect ingredients
 * *across* recipes into one list to actually take to a store. This module
 * persists a flat shopping list in localStorage, keyed by
 * `${recipe_id}_${ingredient_id}` so the same ingredient from two different
 * recipes is tracked (and can be checked off) independently, and dispatches
 * INGREDIENT_ADD_TO_LIST telemetry per ingredient added — mirroring the
 * ACTION_TYPES.INGREDIENT_ADD_TO_LIST contract already defined in
 * dataContracts.js but never wired up anywhere.
 *
 * @module shoppingListService
 */

import { dispatchTelemetry } from './telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'

const LIST_KEY = 'culinaryfeed_shopping_list'

/**
 * @typedef {object} ShoppingListItem
 * @property {string} key            `${recipe_id}_${ingredient_id}` — stable identity.
 * @property {string} recipe_id
 * @property {string} recipe_title
 * @property {string} ingredient_id
 * @property {string} name
 * @property {number|null} quantity
 * @property {string|null} unit
 * @property {string} category
 * @property {boolean} gotIt
 * @property {string} addedAt
 */

function readList() {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList(list) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {
    // noop
  }
}

/**
 * Returns the full shopping list, newest additions last.
 * @returns {ShoppingListItem[]}
 */
export function getShoppingList() {
  return readList()
}

/**
 * Adds every ingredient of a recipe to the shopping list (idempotent — an
 * ingredient already on the list from this same recipe is skipped rather
 * than duplicated). Dispatches one INGREDIENT_ADD_TO_LIST event per
 * newly-added ingredient.
 *
 * @param {object} recipe  Full recipe object (recipe_id, title, ingredients[]).
 * @returns {number} Count of ingredients actually added (excludes skips).
 */
export function addRecipeToShoppingList(recipe) {
  const list = readList()
  const existingKeys = new Set(list.map((item) => item.key))
  let addedCount = 0

  for (const ing of recipe.ingredients ?? []) {
    const key = `${recipe.recipe_id}_${ing.ingredient_id}`
    if (existingKeys.has(key)) continue

    list.push({
      key,
      recipe_id: recipe.recipe_id,
      recipe_title: recipe.title,
      ingredient_id: ing.ingredient_id,
      name: ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      category: ing.category ?? 'other',
      gotIt: false,
      addedAt: new Date().toISOString(),
    })
    existingKeys.add(key)
    addedCount += 1

    dispatchTelemetry(EVENT_TYPES.INGREDIENT_ADD_TO_LIST, {
      recipe_id: recipe.recipe_id,
      ingredient_id: ing.ingredient_id,
    })
  }

  writeList(list)
  return addedCount
}

/**
 * Toggles the "got it" checked state for one shopping list item.
 * @param {string} key
 * @returns {ShoppingListItem[]} The updated list.
 */
export function toggleShoppingListItem(key) {
  const list = readList().map((item) =>
    item.key === key ? { ...item, gotIt: !item.gotIt } : item
  )
  writeList(list)
  return list
}

/**
 * Removes a single item from the shopping list.
 * @param {string} key
 * @returns {ShoppingListItem[]} The updated list.
 */
export function removeShoppingListItem(key) {
  const list = readList().filter((item) => item.key !== key)
  writeList(list)
  return list
}

/**
 * Removes every item currently marked "got it".
 * @returns {ShoppingListItem[]} The updated list.
 */
export function clearCheckedItems() {
  const list = readList().filter((item) => !item.gotIt)
  writeList(list)
  return list
}
