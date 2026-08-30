/**
 * @fileoverview ShoppingListDrawer — cross-recipe shopping list.
 *
 * Backed by `shoppingListService.js`. Recipes are added to the list from
 * RecipeModal's "Add All to Shopping List" button; this drawer is the
 * consolidated view, grouped by ingredient category, with a check-off per
 * item and a way to clear checked items or remove one outright.
 *
 * Props:
 *  - isOpen  {boolean}  Controls visibility and slide transition.
 *  - onClose {function} Called when the backdrop or close button is tapped.
 */

import { useEffect, useState } from 'react'
import {
  getShoppingList,
  toggleShoppingListItem,
  removeShoppingListItem,
  clearCheckedItems,
} from '../services/shoppingListService.js'

const CATEGORY_META = {
  produce: { label: 'Produce', emoji: '🥦' },
  protein: { label: 'Protein', emoji: '🥩' },
  dairy: { label: 'Dairy', emoji: '🧀' },
  pantry: { label: 'Pantry', emoji: '🫙' },
  spice: { label: 'Spices', emoji: '🌶️' },
  condiment: { label: 'Condiments', emoji: '🍯' },
  grain: { label: 'Grains', emoji: '🌾' },
  beverage: { label: 'Beverages', emoji: '🥤' },
  other: { label: 'Other', emoji: '📦' },
}

function groupByCategory(items) {
  const groups = {}
  for (const item of items) {
    const cat = item.category || 'other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }
  return groups
}

export default function ShoppingListDrawer({ isOpen, onClose }) {
  const [items, setItems] = useState([])

  // Re-read from localStorage every time the drawer opens so it always
  // reflects the latest "Add All to Shopping List" actions.
  useEffect(() => {
    // Intentional: re-syncing from localStorage (an external system) each
    // time the drawer opens, not reacting to a prop change — the
    // documented valid case for setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setItems(getShoppingList())
  }, [isOpen])

  function handleToggle(key) {
    setItems(toggleShoppingListItem(key))
  }

  function handleRemove(key) {
    setItems(removeShoppingListItem(key))
  }

  function handleClearChecked() {
    setItems(clearCheckedItems())
  }

  const grouped = groupByCategory(items)
  const checkedCount = items.filter((i) => i.gotIt).length

  return (
    <div
      className={`fixed inset-0 z-[52] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping list"
        className={`absolute top-0 right-0 h-full w-80 max-w-[90vw] bg-neutral-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">🛒</span>
            <h2 className="text-base font-semibold text-white">Shopping List</h2>
            {items.length > 0 && (
              <span className="ml-1 text-xs font-medium text-emerald-400 bg-emerald-400/15 px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            )}
          </div>
          <button
            type="button"
            id="shopping-list-close-btn"
            aria-label="Close shopping list"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white transition-all duration-150"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <span className="text-4xl" aria-hidden="true">🛒</span>
            <p className="text-sm font-medium text-neutral-400 leading-relaxed">
              Your shopping list is empty.<br />
              Open a recipe and tap &quot;Add All to Shopping List&quot; to build one.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-none">
              {Object.entries(grouped).map(([cat, catItems]) => {
                const meta = CATEGORY_META[cat] ?? CATEGORY_META.other
                return (
                  <div key={cat} className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span aria-hidden="true" className="text-base">{meta.emoji}</span>
                      <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
                        {meta.label}
                      </h3>
                      <div className="flex-1 h-px bg-white/8" aria-hidden="true" />
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {catItems.map((item) => (
                        <li key={item.key} className="flex items-center gap-2">
                          <label
                            htmlFor={`shop-check-${item.key}`}
                            className={[
                              'flex-1 flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors duration-150',
                              item.gotIt ? 'bg-emerald-500/10' : 'bg-white/4 hover:bg-white/8',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              id={`shop-check-${item.key}`}
                              checked={item.gotIt}
                              onChange={() => handleToggle(item.key)}
                              className="sr-only"
                            />
                            <div
                              aria-hidden="true"
                              className={[
                                'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-150',
                                item.gotIt ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-white/25',
                              ].join(' ')}
                            >
                              {item.gotIt && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium leading-snug ${item.gotIt ? 'line-through text-white/30' : 'text-white/90'}`}>
                                {item.name}
                                {(item.quantity != null || item.unit) && (
                                  <span className="text-white/35 font-normal text-xs ml-1.5">
                                    {item.quantity ?? ''} {item.unit ?? ''}
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-white/30 mt-0.5 line-clamp-1">
                                from {item.recipe_title}
                              </p>
                            </div>
                          </label>
                          <button
                            type="button"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => handleRemove(item.key)}
                            className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors duration-150"
                          >
                            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>

            {checkedCount > 0 && (
              <div className="px-4 py-3 border-t border-white/10 shrink-0">
                <button
                  type="button"
                  id="shopping-list-clear-checked-btn"
                  onClick={handleClearChecked}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white/10 text-white/70 hover:bg-white/15 active:scale-[0.98] transition-all duration-150"
                >
                  Clear {checkedCount} checked item{checkedCount > 1 ? 's' : ''}
                </button>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
