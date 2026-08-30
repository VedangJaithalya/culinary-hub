/**
 * @fileoverview MealPlannerModal — weekly meal planner.
 *
 * Product/UX: "Meal planner: drag saved recipes onto a weekly calendar."
 *
 * A full-screen overlay (same z-50 layering as RecipeModal/SearchOverlay)
 * showing a horizontally-scrollable tray of the user's saved recipes above
 * a 7-day x 3-slot (Breakfast/Lunch/Dinner) weekly grid. Recipes can be
 * assigned to a slot two ways:
 *  - Desktop: native HTML5 drag-and-drop — drag a tray chip onto a slot.
 *  - Touch/any device: tap an empty slot to open a picker sheet listing
 *    saved recipes, tap one to assign (HTML5 DnD has poor touch support,
 *    so this is the primary path on mobile, not just a fallback).
 *
 * Tapping an already-assigned slot's recipe opens it in RecipeModal via
 * `onRecipeSelect`; a small "×" removes it. "Add all to shopping list"
 * reuses `shoppingListService` to bulk-add every planned recipe's
 * ingredients in one tap.
 *
 * Props:
 *  - isOpen         {boolean}  — Controls visibility and CSS transitions.
 *  - onClose        {function} — Called when the user closes the overlay.
 *  - onRecipeSelect {function} — Called with (recipe) when an assigned
 *                                recipe is tapped (not its remove button).
 */

import { useEffect, useMemo, useState } from 'react'
import mockRecipes from '../data/mockRecipes.json'
import {
  PLAN_DAYS,
  PLAN_SLOTS,
  readPlan,
  assignRecipe,
  clearSlot,
  getSlotRecipeId,
  getPlannedRecipes,
} from '../services/mealPlanService.js'
import { addRecipeToShoppingList } from '../services/shoppingListService.js'

const DRAG_MIME = 'application/x-culinaryfeed-recipe-id'

export default function MealPlannerModal({ isOpen, onClose, onRecipeSelect }) {
  const [plan, setPlan] = useState({})
  const [savedRecipes, setSavedRecipes] = useState([])
  const [pickerTarget, setPickerTarget] = useState(null) // { day, slot } | null
  const [dragOverSlotKey, setDragOverSlotKey] = useState(null)
  const [addedToList, setAddedToList] = useState(false)

  // ── Re-read localStorage every time the modal opens ──────────────────────
  // Mirrors SavedDrawer's pattern: re-syncing from an external system
  // (localStorage) on open, not reacting to a prop change.
  useEffect(() => {
    if (!isOpen) return

    // Intentional: re-syncing from localStorage (an external system) each
    // time the modal opens, not reacting to a prop change — the documented
    // valid case for setState-in-effect (see SavedDrawer.jsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlan(readPlan())
    setAddedToList(false)

    try {
      const raw = localStorage.getItem('culinaryfeed_saved_recipes') || '[]'
      const ids = JSON.parse(raw)
      const list = Array.isArray(ids) ? mockRecipes.filter((r) => ids.includes(r.recipe_id)) : []
      setSavedRecipes(list)
    } catch {
      setSavedRecipes([])
    }
  }, [isOpen])

  const recipesById = useMemo(() => {
    const map = new Map()
    for (const r of mockRecipes) map.set(r.recipe_id, r)
    return map
  }, [])

  const plannedRecipes = useMemo(() => getPlannedRecipes(mockRecipes, plan), [plan])

  function handleAssign(day, slot, recipeId) {
    const updated = assignRecipe(day, slot, recipeId)
    setPlan({ ...updated })
    setPickerTarget(null)
    setDragOverSlotKey(null)
  }

  function handleClear(day, slot) {
    const updated = clearSlot(day, slot)
    setPlan({ ...updated })
  }

  function handleAddAllToShoppingList() {
    for (const recipe of plannedRecipes) addRecipeToShoppingList(recipe)
    setAddedToList(true)
  }

  function handleDrop(e, day, slot) {
    e.preventDefault()
    setDragOverSlotKey(null)
    const recipeId = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
    if (recipeId) handleAssign(day, slot, recipeId)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Meal planner"
      className={[
        'fixed inset-0 z-50 flex flex-col bg-neutral-950',
        'transition-opacity duration-200',
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div className="w-full max-w-md mx-auto h-full flex flex-col min-h-0">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="shrink-0 px-5 pt-6 pb-3 flex items-center justify-between gap-3 border-b border-white/8">
          <div>
            <h2 className="text-lg font-bold text-white">Meal Planner</h2>
            <p className="text-xs text-white/40 mt-0.5">Drag or tap to plan your week</p>
          </div>
          <button
            type="button"
            id="meal-planner-close-btn"
            aria-label="Close meal planner"
            onClick={onClose}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all duration-150 text-white/70 hover:text-white"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* ── Saved recipes tray (drag source) ────────────────────────────── */}
        <div className="shrink-0 px-5 py-3 border-b border-white/8">
          <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">
            Your saved recipes
          </p>
          {savedRecipes.length === 0 ? (
            <p className="text-xs text-white/35">
              Save recipes from the feed (bookmark icon) to plan them here.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {savedRecipes.map((recipe) => (
                <div
                  key={recipe.recipe_id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, recipe.recipe_id)
                    e.dataTransfer.setData('text/plain', recipe.recipe_id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="shrink-0 w-20 cursor-grab active:cursor-grabbing select-none"
                  title={recipe.title}
                >
                  <div className="w-20 h-16 rounded-lg overflow-hidden bg-neutral-800 mb-1 pointer-events-none">
                    <img
                      src={recipe.media_url}
                      alt={recipe.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-[10px] font-semibold text-white/75 leading-snug line-clamp-2 pointer-events-none">
                    {recipe.title}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Weekly grid ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="flex flex-col gap-4">
            {PLAN_DAYS.map((day) => (
              <div key={day.id}>
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-2">
                  {day.label}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {PLAN_SLOTS.map((slot) => {
                    const key = `${day.id}_${slot.id}`
                    const recipeId = getSlotRecipeId(plan, day.id, slot.id)
                    const recipe = recipeId ? recipesById.get(recipeId) : null
                    const isDragOver = dragOverSlotKey === key

                    return (
                      <div
                        key={key}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (dragOverSlotKey !== key) setDragOverSlotKey(key)
                        }}
                        onDragLeave={() => setDragOverSlotKey((cur) => (cur === key ? null : cur))}
                        onDrop={(e) => handleDrop(e, day.id, slot.id)}
                        className={[
                          'rounded-xl border-2 border-dashed p-1.5 min-h-[92px] flex flex-col transition-colors duration-150',
                          isDragOver ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-white/4',
                        ].join(' ')}
                      >
                        <span className="text-[9px] font-bold text-white/35 uppercase tracking-wide flex items-center gap-1 mb-1">
                          <span aria-hidden="true">{slot.emoji}</span>
                          {slot.label}
                        </span>

                        {recipe ? (
                          <div className="relative flex-1">
                            <button
                              type="button"
                              id={`meal-slot-recipe-${key}`}
                              onClick={() => onRecipeSelect?.(recipe)}
                              className="w-full h-full flex flex-col gap-0.5 text-left"
                            >
                              <div className="w-full h-8 rounded overflow-hidden bg-neutral-800">
                                <img
                                  src={recipe.media_url}
                                  alt={recipe.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <span className="text-[10px] font-semibold text-white/85 leading-tight line-clamp-2">
                                {recipe.title}
                              </span>
                            </button>
                            <button
                              type="button"
                              id={`meal-slot-remove-${key}`}
                              aria-label={`Remove ${recipe.title} from ${day.label} ${slot.label}`}
                              onClick={() => handleClear(day.id, slot.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-neutral-900 border border-white/20 text-white/60 hover:text-white text-[9px] leading-none"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            id={`meal-slot-add-${key}`}
                            aria-label={`Add a recipe to ${day.label} ${slot.label}`}
                            onClick={() => setPickerTarget({ day: day.id, slot: slot.id })}
                            className="flex-1 flex items-center justify-center text-white/25 hover:text-white/50 transition-colors duration-150 text-lg"
                          >
                            +
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer: bulk shopping list action ───────────────────────────── */}
        {plannedRecipes.length > 0 && (
          <footer className="shrink-0 px-5 py-3 border-t border-white/8">
            <button
              type="button"
              id="meal-planner-add-shopping-list-btn"
              onClick={handleAddAllToShoppingList}
              disabled={addedToList}
              className={[
                'w-full py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.98]',
                addedToList
                  ? 'bg-emerald-500/15 text-emerald-300 cursor-default'
                  : 'bg-white/8 text-white/80 hover:bg-white/12',
              ].join(' ')}
            >
              {addedToList
                ? 'Added to Shopping List ✓'
                : `🛒 Add All ${plannedRecipes.length} Planned Recipe${plannedRecipes.length === 1 ? '' : 's'} to Shopping List`}
            </button>
          </footer>
        )}
      </div>

      {/* ── Tap-to-assign picker sheet (touch fallback for drag-and-drop) ── */}
      {pickerTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a recipe"
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/70"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerTarget(null)
          }}
        >
          <div className="w-full max-w-md mx-auto bg-neutral-900 rounded-t-3xl border-t border-neutral-800 max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-white">
                Add to{' '}
                {PLAN_DAYS.find((d) => d.id === pickerTarget.day)?.label}{' '}
                {PLAN_SLOTS.find((s) => s.id === pickerTarget.slot)?.label}
              </h3>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setPickerTarget(null)}
                className="text-white/50 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {savedRecipes.length === 0 ? (
                <p className="text-xs text-white/40 text-center py-6">
                  No saved recipes yet — save some from the feed first.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5 pb-4">
                  {savedRecipes.map((recipe) => (
                    <li key={recipe.recipe_id}>
                      <button
                        type="button"
                        id={`picker-recipe-${recipe.recipe_id}`}
                        onClick={() => handleAssign(pickerTarget.day, pickerTarget.slot, recipe.recipe_id)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.99] transition-all duration-150 text-left"
                      >
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                          <img src={recipe.media_url} alt={recipe.title} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <span className="text-sm font-medium text-white/85 leading-snug line-clamp-2">
                          {recipe.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
