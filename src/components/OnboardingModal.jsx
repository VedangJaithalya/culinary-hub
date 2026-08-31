/**
 * @fileoverview OnboardingModal — first-run cold-start survey.
 *
 * `DimUser.preferredCuisines` and `DimUser.dietaryFlags` were defined in
 * dataContracts.js from the start but nothing ever collected them, so every
 * brand-new user fell back to a flat uniform cold-start feed. This is a
 * single-screen, three-question survey shown once (gated in App.jsx by
 * `hasCompletedOnboarding()`) that persists the answers via
 * `userProfileService.js`, which `affinityModel.js` and `rankingEngine.js`
 * now read to bias the very first feed a new user sees.
 *
 * Props:
 *  - onComplete {function} — Called once the profile has been saved.
 */

import { useMemo, useState } from 'react'
import mockRecipes from '../data/mockRecipes.json'
import { saveUserProfile } from '../services/userProfileService.js'
import { dispatchTelemetry } from '../services/telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten-free', label: 'Gluten-Free' },
  { id: 'dairy-free', label: 'Dairy-Free' },
]

const SKILL_LEVELS = [
  { id: 'beginner', label: 'Beginner', blurb: 'Simple, low-fuss recipes' },
  { id: 'intermediate', label: 'Intermediate', blurb: 'Comfortable with most techniques' },
  { id: 'advanced', label: 'Advanced', blurb: 'Ready for a challenge' },
  { id: 'professional', label: 'Professional', blurb: 'Cook for a living, or close to it' },
]

function cuisineLabel(cuisineId) {
  return cuisineId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function OnboardingModal({ onComplete }) {
  const allCuisines = useMemo(() => {
    const ids = [...new Set(mockRecipes.map((r) => r.cuisine_id).filter(Boolean))]
    return ids.sort((a, b) => cuisineLabel(a).localeCompare(cuisineLabel(b)))
  }, [])

  const [selectedCuisines, setSelectedCuisines] = useState([])
  const [selectedDietary, setSelectedDietary] = useState([])
  const [skillLevel, setSkillLevel] = useState(null)

  function toggleCuisine(id) {
    setSelectedCuisines((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  function toggleDietary(id) {
    setSelectedDietary((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  function handleSubmit() {
    saveUserProfile({
      preferredCuisines: selectedCuisines,
      dietaryFlags: selectedDietary,
      skillLevel,
    })

    dispatchTelemetry(EVENT_TYPES.ONBOARDING_COMPLETE, {
      preferred_cuisines: selectedCuisines,
      dietary_flags: selectedDietary,
      skill_level: skillLevel,
    })

    onComplete()
  }

  function handleSkip() {
    // Still marks onboarding as "completed" (with empty preferences) so the
    // survey doesn't reappear every session — the cold-start vector then
    // degrades exactly to the original flat uniform distribution.
    saveUserProfile({ preferredCuisines: [], dietaryFlags: [], skillLevel: null })
    dispatchTelemetry(EVENT_TYPES.ONBOARDING_COMPLETE, {
      preferred_cuisines: [],
      dietary_flags: [],
      skill_level: null,
      skipped: true,
    })
    onComplete()
  }

  return (
    <div className="h-screen w-full max-w-md mx-auto overflow-y-auto scrollbar-none bg-neutral-950 text-white flex flex-col">
      <div className="px-6 pt-12 pb-6">
        <span className="text-4xl" aria-hidden="true">👋</span>
        <h1 className="text-2xl font-bold mt-3">Welcome to CulinaryHub</h1>
        <p className="text-sm text-white/50 mt-2 leading-relaxed">
          Answer a few quick questions so your very first feed already feels like you —
          you can always change these later.
        </p>
      </div>

      {/* ── Cuisines ─────────────────────────────────────────────────────── */}
      <section className="px-6 pb-8">
        <h2 className="text-sm font-semibold text-white/80 mb-1">
          Which cuisines are you into?
        </h2>
        <p className="text-xs text-white/40 mb-3">Pick as many as you like.</p>
        <div className="flex flex-wrap gap-2">
          {allCuisines.map((id) => {
            const active = selectedCuisines.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleCuisine(id)}
                aria-pressed={active}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 active:scale-95',
                  active
                    ? 'bg-violet-500 border-violet-400 text-white'
                    : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10',
                ].join(' ')}
              >
                {cuisineLabel(id)}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Dietary preferences ──────────────────────────────────────────── */}
      <section className="px-6 pb-8">
        <h2 className="text-sm font-semibold text-white/80 mb-1">
          Any dietary preferences?
        </h2>
        <p className="text-xs text-white/40 mb-3">Optional — leave blank if none apply.</p>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map(({ id, label }) => {
            const active = selectedDietary.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleDietary(id)}
                aria-pressed={active}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 active:scale-95',
                  active
                    ? 'bg-emerald-500 border-emerald-400 text-white'
                    : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Skill level ──────────────────────────────────────────────────── */}
      <section className="px-6 pb-10">
        <h2 className="text-sm font-semibold text-white/80 mb-3">
          How would you describe your cooking skill?
        </h2>
        <div className="flex flex-col gap-2">
          {SKILL_LEVELS.map(({ id, label, blurb }) => {
            const active = skillLevel === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSkillLevel(id)}
                aria-pressed={active}
                className={[
                  'text-left px-4 py-3 rounded-xl border transition-all duration-150 active:scale-[0.98]',
                  active
                    ? 'bg-amber-400/15 border-amber-400/60'
                    : 'bg-white/5 border-white/10 hover:bg-white/8',
                ].join(' ')}
              >
                <p className={`text-sm font-semibold ${active ? 'text-amber-300' : 'text-white/90'}`}>
                  {label}
                </p>
                <p className="text-xs text-white/40 mt-0.5">{blurb}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="mt-auto sticky bottom-0 px-6 pb-8 pt-4 bg-gradient-to-t from-neutral-950 via-neutral-950 to-transparent flex flex-col gap-2">
        <button
          type="button"
          id="onboarding-submit-btn"
          onClick={handleSubmit}
          className="w-full py-3.5 rounded-xl text-sm font-bold bg-violet-500 hover:bg-violet-400 active:scale-[0.98] text-white transition-all duration-150"
        >
          Start Cooking
        </button>
        <button
          type="button"
          id="onboarding-skip-btn"
          onClick={handleSkip}
          className="w-full py-2 text-xs font-medium text-white/40 hover:text-white/70 transition-colors duration-150"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
