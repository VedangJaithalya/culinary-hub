/**
 * @fileoverview mealPlanService — weekly meal planner persistence.
 *
 * Product/UX: "Meal planner: drag saved recipes onto a weekly calendar."
 *
 * There's no backend and no concept of "the current week" server-side, so
 * this models a recurring weekly *template* (Monday..Sunday x
 * Breakfast/Lunch/Dinner) rather than dates on a specific calendar month —
 * the same plan re-applies every week until the user changes it, which is
 * both simpler to persist in localStorage and more useful for a habitual
 * meal-prep routine than a plan that goes stale after seven days.
 *
 * Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps, fully
 * defensive: a missing/blocked localStorage or malformed JSON always
 * degrades to an empty plan rather than throwing.
 *
 * @module mealPlanService
 */

const PLAN_KEY = 'culinaryfeed_meal_plan'

/** Canonical day order, Monday-first. */
export const PLAN_DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
]

/** Canonical meal slot order within a day. */
export const PLAN_SLOTS = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { id: 'lunch', label: 'Lunch', emoji: '☀️' },
  { id: 'dinner', label: 'Dinner', emoji: '🌙' },
]

/**
 * @typedef {Object.<string, string>} MealPlan
 * Flat map of `${day}_${slot}` -> recipe_id. A key is absent (not just
 * null/empty) when that slot has nothing assigned, keeping the persisted
 * shape minimal.
 */

function slotKey(day, slot) {
  return `${day}_${slot}`
}

/**
 * Reads the persisted weekly plan.
 * @returns {MealPlan}
 */
export function readPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePlan(plan) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
  } catch {
    // localStorage unavailable — in-memory caller state still updates.
  }
}

/**
 * Assigns a recipe to a specific day + meal slot, overwriting whatever was
 * there before.
 *
 * @param {string} day    One of PLAN_DAYS ids.
 * @param {string} slot   One of PLAN_SLOTS ids.
 * @param {string} recipeId
 * @returns {MealPlan} The updated plan.
 */
export function assignRecipe(day, slot, recipeId) {
  if (!day || !slot || !recipeId) return readPlan()
  const plan = readPlan()
  plan[slotKey(day, slot)] = recipeId
  writePlan(plan)
  return plan
}

/**
 * Clears whatever recipe is assigned to a day + meal slot.
 *
 * @param {string} day
 * @param {string} slot
 * @returns {MealPlan} The updated plan.
 */
export function clearSlot(day, slot) {
  const plan = readPlan()
  delete plan[slotKey(day, slot)]
  writePlan(plan)
  return plan
}

/**
 * Looks up the recipe_id (or null) assigned to a day + meal slot.
 * @param {MealPlan} plan
 * @param {string} day
 * @param {string} slot
 * @returns {string|null}
 */
export function getSlotRecipeId(plan, day, slot) {
  return plan?.[slotKey(day, slot)] ?? null
}

/**
 * Returns the deduplicated list of recipe_ids currently assigned anywhere
 * in the plan, in first-assigned order.
 *
 * @param {MealPlan} [plan]  Defaults to reading the persisted plan.
 * @returns {string[]}
 */
export function getPlannedRecipeIds(plan = readPlan()) {
  return [...new Set(Object.values(plan).filter(Boolean))]
}

/**
 * Resolves the full recipe objects currently assigned anywhere in the plan.
 *
 * @param {object[]} catalog  Full recipe catalog (e.g. mockRecipes.json).
 * @param {MealPlan} [plan]
 * @returns {object[]}
 */
export function getPlannedRecipes(catalog, plan = readPlan()) {
  const ids = new Set(getPlannedRecipeIds(plan))
  return (catalog ?? []).filter((r) => ids.has(r?.recipe_id))
}

/**
 * Clears every slot in the plan.
 * @returns {MealPlan} The now-empty plan.
 */
export function clearPlan() {
  const empty = {}
  writePlan(empty)
  return empty
}
