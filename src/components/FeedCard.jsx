import { BookmarkIcon, ShareIcon, InformationCircleIcon } from './icons/ActionIcons'

/**
 * FeedCard
 *
 * A full-screen, snap-scroll recipe card. Designed for mobile viewports inside
 * a `snap-y snap-mandatory` scroll container.
 *
 * Props:
 *  - recipe {object}           — A single recipe object from mockRecipes.json
 *  - index  {number}           — Zero-based position in the feed (used for telemetry)
 *  - onExpandRecipe {function} — Called with (recipe, triggerSource) when the user
 *                               opens recipe details. triggerSource is one of:
 *                               'details_button' | 'card_tap'
 */
export default function FeedCard({ recipe, index, onExpandRecipe }) {
  const {
    recipe_id,
    cuisine_id,
    difficulty_tier,
    title,
    media_url,
    prep_time_minutes,
    cook_time_minutes,
    calorie_count,
    steps = [],
  } = recipe

  // ── Derived display values ────────────────────────────────────────────────
  const cuisineLabel = cuisine_id
    ? cuisine_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—'

  const difficultyLabel = difficulty_tier
    ? difficulty_tier.charAt(0).toUpperCase() + difficulty_tier.slice(1)
    : '—'

  const prepLabel  = prep_time_minutes != null ? `${prep_time_minutes}m` : '—'
  const cookLabel  = cook_time_minutes  != null ? `${cook_time_minutes}m` : '—'
  const calorieLabel = calorie_count    != null ? `${calorie_count} kcal` : '—'
  const stepsCount   = Array.isArray(steps) ? steps.length : 0

  // ── Difficulty colour accent ───────────────────────────────────────────────
  const tierColour = {
    beginner:     'bg-emerald-500/80 text-white',
    easy:         'bg-emerald-500/80 text-white',
    intermediate: 'bg-amber-400/80  text-black',
    advanced:     'bg-rose-500/80   text-white',
    expert:       'bg-rose-700/80   text-white',
  }[difficulty_tier] ?? 'bg-white/20 text-white'

  return (
    <article
      className="h-screen w-full snap-start snap-always relative flex flex-col justify-between overflow-hidden bg-neutral-900 select-none"
      data-recipe-id={recipe_id}
      data-feed-index={index}
      data-cuisine-id={cuisine_id}
    >
      {/* ── Background image ──────────────────────────────────────────────── */}
      <img
        src={media_url}
        alt={title}
        className="object-cover w-full h-full absolute inset-0"
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
      />

      {/* ── Darkening gradient overlay ────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="bg-gradient-to-b from-black/40 via-transparent to-black/90 absolute inset-0 pointer-events-none"
      />

      {/* ── Top bar: cuisine badge + difficulty badge ─────────────────────── */}
      <header className="relative z-10 flex items-center gap-2 px-4 pt-5">
        <span className="text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white border border-white/20">
          {cuisineLabel}
        </span>
        <span
          className={`text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full backdrop-blur-sm border border-white/20 ${tierColour}`}
        >
          {difficultyLabel}
        </span>
      </header>

      {/* ── Bottom overlay (left content) + right action rail ────────────── */}
      {/*
       * The entire bottom metadata zone is a tap target (`card_tap`).
       * The CTA button inside it is a more specific trigger (`details_button`).
       * stopPropagation on the button ensures only one event fires.
       */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`View details for ${title}`}
        className="relative z-10 flex items-end justify-between px-4 pb-8 gap-4 cursor-pointer"
        onClick={() => onExpandRecipe(recipe, 'card_tap')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onExpandRecipe(recipe, 'card_tap')
          }
        }}
      >

        {/* Left: recipe meta + CTA */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Title */}
          <h2 className="text-xl font-bold text-white leading-snug drop-shadow-md line-clamp-2">
            {title}
          </h2>

          {/* Meta chips row */}
          <div className="flex flex-wrap items-center gap-2">
            <MetaChip icon="🕐" label={`Prep ${prepLabel}`} />
            <MetaChip icon="🔥" label={`Cook ${cookLabel}`} />
            <MetaChip icon="⚡" label={calorieLabel} />
            <MetaChip icon="📋" label={`${stepsCount} steps`} />
          </div>

          {/* Expand CTA — fires 'details_button', stops propagation */}
          <button
            type="button"
            id={`expand-recipe-btn-${recipe_id}`}
            onClick={(e) => {
              e.stopPropagation()
              onExpandRecipe(recipe, 'details_button')
            }}
            className="mt-1 self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md border border-white/25 transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span>View Recipe &amp; Ingredients</span>
            <svg
              aria-hidden="true"
              className="w-4 h-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Right: vertical action rail — stop propagation so taps don't trigger card_tap */}
        <nav
          aria-label="Recipe actions"
          className="flex flex-col items-center gap-5 pb-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionButton
            id={`bookmark-btn-${recipe_id}`}
            icon={<BookmarkIcon />}
            label="Save recipe"
          />
          <ActionButton
            id={`share-btn-${recipe_id}`}
            icon={<ShareIcon />}
            label="Share recipe"
          />
          <ActionButton
            id={`details-btn-${recipe_id}`}
            icon={<InformationCircleIcon />}
            label="Recipe details"
          />
        </nav>
      </div>
    </article>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Small frosted-glass metadata chip */
function MetaChip({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-white/90 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-lg">
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  )
}

/** Circular icon button for the right action rail */
function ActionButton({ id, icon, label }) {
  return (
    <button
      type="button"
      id={id}
      aria-label={label}
      className="flex flex-col items-center gap-1 group"
    >
      <span className="w-11 h-11 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-md border border-white/20 text-white transition-all duration-150 group-hover:bg-white/25 group-active:scale-90">
        {icon}
      </span>
    </button>
  )
}
