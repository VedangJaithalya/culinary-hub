/**
 * @fileoverview CookModeView — guided, step-by-step cooking mode.
 *
 * Every recipe step already carries a `duration_estimate_seconds`, but
 * nothing in the app used it — the Instructions tab just listed it as text.
 * This is a full-screen overlay (stacked above RecipeModal) that walks
 * through `recipe.steps` one at a time with a live countdown timer seeded
 * from that field, plus next/previous navigation and a progress trail.
 *
 * Props:
 *  - isOpen  {boolean}   Controls visibility.
 *  - recipe  {object|null} The recipe being cooked (needs title, steps[]).
 *  - onClose {function}  Called when the user exits Cook Mode early.
 *  - onFinish {function} Called when the user completes the final step.
 */

import { useEffect, useState } from 'react'

function formatClock(totalSeconds) {
  const clamped = Math.max(0, totalSeconds)
  const m = Math.floor(clamped / 60)
  const s = clamped % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CookModeView({ isOpen, recipe, onClose, onFinish }) {
  const sortedSteps = [...(recipe?.steps ?? [])].sort((a, b) => a.step_number - b.step_number)
  const [stepIndex, setStepIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(null)

  const currentStep = sortedSteps[stepIndex]
  const isLastStep = stepIndex === sortedSteps.length - 1

  // ── Reset to the first step whenever Cook Mode is (re)opened ─────────────
  // Done during render (React's documented "adjusting state when a prop
  // changes" pattern) rather than in an effect, since it's a pure reaction
  // to `isOpen` flipping true, not a synchronisation with anything external.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) setStepIndex(0)
  }

  // ── (Re)seed the countdown whenever the active step changes ──────────────
  // Same render-time pattern: reacting to `stepIndex`/`recipe` changing, not
  // synchronising with an external system.
  const stepKey = `${recipe?.recipe_id ?? ''}_${stepIndex}`
  const [prevStepKey, setPrevStepKey] = useState(null)
  if (stepKey !== prevStepKey) {
    setPrevStepKey(stepKey)
    setSecondsLeft(currentStep?.duration_estimate_seconds ?? null)
  }

  // Tick the countdown down once per second while Cook Mode is open and the
  // current step has a known duration.
  useEffect(() => {
    if (!isOpen || secondsLeft == null) return
    if (secondsLeft <= 0) return

    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev == null ? null : Math.max(0, prev - 1)))
    }, 1000)

    return () => clearInterval(id)
  }, [isOpen, secondsLeft])

  if (!isOpen || !recipe || sortedSteps.length === 0) return null

  function handleNext() {
    if (isLastStep) {
      onFinish?.()
    } else {
      setStepIndex((i) => Math.min(sortedSteps.length - 1, i + 1))
    }
  }

  function handlePrev() {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  const isTimerDone = secondsLeft === 0
  const hasTimer = currentStep?.duration_estimate_seconds != null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Cook Mode: ${recipe.title}`}
      className="fixed inset-0 z-[70] bg-neutral-950 flex flex-col"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-400">
            Cook Mode
          </p>
          <h2 className="text-sm font-bold text-white leading-snug line-clamp-1">
            {recipe.title}
          </h2>
        </div>
        <button
          type="button"
          id="cook-mode-close-btn"
          aria-label="Exit Cook Mode"
          onClick={onClose}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all duration-150 text-white/70 hover:text-white"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* ── Progress dots ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-5 pb-6 shrink-0" aria-hidden="true">
        {sortedSteps.map((step, i) => (
          <div
            key={step.step_number}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
              i <= stepIndex ? 'bg-violet-500' : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      {/* ── Active step ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 flex flex-col items-center justify-center text-center gap-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-white/30">
            Step {currentStep.step_number} of {sortedSteps.length}
          </span>
          <p className="text-xl font-semibold text-white leading-relaxed mt-4 max-w-sm">
            {currentStep.instruction_text}
          </p>
        </div>

        {hasTimer && (
          <div
            className={[
              'flex flex-col items-center gap-1 px-8 py-5 rounded-3xl border transition-colors duration-300',
              isTimerDone
                ? 'bg-emerald-500/15 border-emerald-500/40'
                : 'bg-white/5 border-white/10',
            ].join(' ')}
          >
            <span
              className={`text-4xl font-mono font-bold tabular-nums ${
                isTimerDone ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {formatClock(secondsLeft ?? 0)}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">
              {isTimerDone ? "Time's up" : 'estimated time'}
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 pb-10 pt-4 flex items-center gap-3">
        <button
          type="button"
          id="cook-mode-prev-btn"
          onClick={handlePrev}
          disabled={stepIndex === 0}
          className="flex-1 py-3.5 rounded-xl text-sm font-semibold bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-white/15 active:enabled:scale-[0.98] transition-all duration-150"
        >
          Back
        </button>
        <button
          type="button"
          id="cook-mode-next-btn"
          onClick={handleNext}
          className="flex-[2] py-3.5 rounded-xl text-sm font-bold bg-violet-500 hover:bg-violet-400 active:scale-[0.98] text-white transition-all duration-150"
        >
          {isLastStep ? 'Finish Cooking' : 'Next Step'}
        </button>
      </div>
    </div>
  )
}
