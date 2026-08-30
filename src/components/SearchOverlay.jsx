/**
 * @fileoverview SearchOverlay — full-text search + structured filters.
 *
 * Product/UX: "Search and filters (cuisine, difficulty, dietary, max time) —
 * there's currently no way to find a recipe other than scrolling the feed."
 *
 * A full-screen overlay (mirrors RecipeModal's z-50 layering) with a search
 * input, chip-based cuisine/difficulty/dietary filters, and a max-total-time
 * preset row. Filtering runs client-side over the full `mockRecipes` catalog
 * via the pure `searchAndFilterRecipes` helper — every recipe is searchable
 * here regardless of feed/dismiss state, since search is an explicit lookup,
 * not a ranked recommendation surface.
 *
 * Props:
 *  - isOpen         {boolean}  — Controls visibility and CSS transitions.
 *  - onClose        {function} — Called when the user closes the overlay.
 *  - onSelectRecipe {function} — Called with (recipe) when a result is tapped.
 */

import { useMemo, useState } from 'react'
import mockRecipes from '../data/mockRecipes.json'
import {
  searchAndFilterRecipes,
  getAvailableCuisines,
  getAvailableDietaryTags,
  formatSlugLabel,
  DIFFICULTY_FILTER_ORDER,
} from '../engine/searchEngine.js'

const TIME_PRESETS = [
  { label: 'Any time', value: null },
  { label: '≤ 15m', value: 15 },
  { label: '≤ 30m', value: 30 },
  { label: '≤ 45m', value: 45 },
  { label: '≤ 60m', value: 60 },
]

/** Toggles a value's membership in an array, returning a new array. */
function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export default function SearchOverlay({ isOpen, onClose, onSelectRecipe }) {
  const [query, setQuery] = useState('')
  const [selectedCuisines, setSelectedCuisines] = useState([])
  const [selectedDifficulties, setSelectedDifficulties] = useState([])
  const [selectedDietary, setSelectedDietary] = useState([])
  const [maxTotalTimeMinutes, setMaxTotalTimeMinutes] = useState(null)

  const allCuisines = useMemo(() => getAvailableCuisines(mockRecipes), [])
  const allDietaryTags = useMemo(() => getAvailableDietaryTags(mockRecipes), [])

  const results = useMemo(
    () =>
      searchAndFilterRecipes(mockRecipes, {
        query,
        cuisines: selectedCuisines,
        difficulties: selectedDifficulties,
        dietaryTags: selectedDietary,
        maxTotalTimeMinutes,
      }),
    [query, selectedCuisines, selectedDifficulties, selectedDietary, maxTotalTimeMinutes]
  )

  const activeFilterCount =
    selectedCuisines.length +
    selectedDifficulties.length +
    selectedDietary.length +
    (maxTotalTimeMinutes != null ? 1 : 0)

  function handleClearFilters() {
    setSelectedCuisines([])
    setSelectedDifficulties([])
    setSelectedDietary([])
    setMaxTotalTimeMinutes(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search recipes"
      className={[
        'fixed inset-0 z-50 flex flex-col bg-neutral-950',
        'transition-opacity duration-200',
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div className="w-full max-w-md mx-auto h-full flex flex-col min-h-0">
        {/* ── Header: search input + close ─────────────────────────────── */}
        <header className="shrink-0 px-4 pt-6 pb-3 flex items-center gap-2">
          <div className="flex-1 relative">
            <span
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm"
            >
              🔍
            </span>
            <input
              type="search"
              id="recipe-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes, cuisines, tags…"
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/8 text-sm text-white placeholder:text-white/35 border border-white/10 focus:outline-none focus:border-violet-400/60 transition-colors duration-150"
            />
          </div>
          <button
            type="button"
            id="search-overlay-close-btn"
            aria-label="Close search"
            onClick={onClose}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all duration-150 text-white/70 hover:text-white"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="shrink-0 px-4 pb-3 flex flex-col gap-3 border-b border-white/8">
          {/* Cuisine chips */}
          <FilterChipRow
            options={allCuisines}
            selected={selectedCuisines}
            onToggle={(id) => setSelectedCuisines((prev) => toggleInList(prev, id))}
            labelFor={formatSlugLabel}
          />

          {/* Difficulty + dietary chips share a row on their own line */}
          <div className="flex flex-wrap gap-1.5">
            {DIFFICULTY_FILTER_ORDER.map((tier) => (
              <Chip
                key={tier}
                active={selectedDifficulties.includes(tier)}
                onClick={() => setSelectedDifficulties((prev) => toggleInList(prev, tier))}
                accent="amber"
              >
                {formatSlugLabel(tier)}
              </Chip>
            ))}
            {allDietaryTags.map((tag) => (
              <Chip
                key={tag}
                active={selectedDietary.includes(tag)}
                onClick={() => setSelectedDietary((prev) => toggleInList(prev, tag))}
                accent="emerald"
              >
                {formatSlugLabel(tag)}
              </Chip>
            ))}
          </div>

          {/* Max total time presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {TIME_PRESETS.map(({ label, value }) => (
              <Chip
                key={label}
                active={maxTotalTimeMinutes === value}
                onClick={() => setMaxTotalTimeMinutes(value)}
                accent="violet"
              >
                {label}
              </Chip>
            ))}
            {activeFilterCount > 0 && (
              <button
                type="button"
                id="search-clear-filters-btn"
                onClick={handleClearFilters}
                className="ml-auto text-[11px] font-semibold text-white/40 hover:text-white/70 transition-colors duration-150 px-2"
              >
                Clear filters ({activeFilterCount})
              </button>
            )}
          </div>
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <p className="text-[11px] font-semibold text-white/35 uppercase tracking-widest mb-2">
            {results.length} recipe{results.length === 1 ? '' : 's'}
          </p>

          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-white/40">
              <span className="text-3xl" aria-hidden="true">🥲</span>
              <p className="text-sm font-medium">No recipes match your search.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 pb-6">
              {results.map((recipe) => (
                <li key={recipe.recipe_id}>
                  <button
                    type="button"
                    id={`search-result-${recipe.recipe_id}`}
                    onClick={() => onSelectRecipe?.(recipe)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.99] transition-all duration-150 text-left"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                      <img
                        src={recipe.media_url}
                        alt={recipe.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/90 leading-snug line-clamp-1">
                        {recipe.title}
                      </p>
                      <p className="text-xs text-white/45 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{formatSlugLabel(recipe.cuisine_id)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSlugLabel(recipe.difficulty_tier)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{recipe.total_time_minutes}m</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                      <span aria-hidden="true">★</span>
                      {(recipe.average_rating ?? 0).toFixed(1)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Horizontally scrollable row of single-purpose chips (used for cuisines). */
function FilterChipRow({ options, selected, onToggle, labelFor }) {
  if (options.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {options.map((id) => (
        <Chip key={id} active={selected.includes(id)} onClick={() => onToggle(id)} accent="violet">
          {labelFor(id)}
        </Chip>
      ))}
    </div>
  )
}

const ACCENT_CLASSES = {
  violet: 'bg-violet-500 border-violet-400 text-white',
  amber: 'bg-amber-400 border-amber-300 text-black',
  emerald: 'bg-emerald-500 border-emerald-400 text-white',
}

/** A single toggle-able filter pill. */
function Chip({ active, onClick, accent = 'violet', children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 active:scale-95 whitespace-nowrap',
        active ? ACCENT_CLASSES[accent] : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
