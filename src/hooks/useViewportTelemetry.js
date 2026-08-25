/**
 * @fileoverview useViewportTelemetry — Phase 2, Pass 2
 *
 * Custom React hook that attaches an IntersectionObserver to the snap-scroll
 * feed container and fires telemetry events as recipe cards enter and leave
 * the viewport.
 *
 * Lifecycle:
 *  - Card enters viewport (≥60% visible):
 *      • Finalises the dwell event for the previously active card.
 *      • Records the entry timestamp and starts a heartbeat interval.
 *  - Card exits viewport (ratio < 60%):
 *      • Calculates total dwell time and dispatches a final dwell update.
 *      • Clears the heartbeat interval.
 *  - Component unmounts:
 *      • Disconnects the observer and clears all active intervals.
 *
 * NOTE: The data contract defines HEARTBEAT_INTERVAL_MS = 5000 ms.
 * The hook honours this constant rather than hard-coding 1000 ms.
 *
 * @module useViewportTelemetry
 */

import { useEffect, useRef } from 'react'
import { EVENT_TYPES, HEARTBEAT_INTERVAL_MS, CARD_FORMATS } from '../data/dataContracts.js'
import { dispatchTelemetry } from '../services/telemetryService.js'

// Minimum intersection ratio to qualify a card as "in view"
const VISIBILITY_THRESHOLD = 0.6

/**
 * Attaches viewport telemetry tracking to a snap-scroll feed container.
 *
 * @param {React.RefObject<HTMLElement>} containerRef - Ref to the scroll container element.
 * @param {object[]}                    recipes      - Array of recipe objects from the feed.
 */
export default function useViewportTelemetry(containerRef, recipes) {
  // ── Stable mutable refs (no re-renders needed) ─────────────────────────────

  /** @type {React.MutableRefObject<string|null>} recipe_id of the card currently in view */
  const activeRecipeId = useRef(null)

  /** @type {React.MutableRefObject<number|null>} Date.now() when current card entered view */
  const entryTimestamp = useRef(null)

  /** @type {React.MutableRefObject<number|null>} setInterval handle for active heartbeat */
  const heartbeatIntervalId = useRef(null)

  /**
   * @type {React.MutableRefObject<number>}
   * Monotonically increasing heartbeat counter for the active card.
   * Resets to 0 when a new card becomes active.
   */
  const heartbeatSequence = useRef(0)

  /**
   * @type {React.MutableRefObject<Map<string, number>>}
   * Tracks cumulative dwell time (ms) per recipe_id across multiple views
   * within the same session (e.g. user scrolls back up to a card).
   */
  const cumulativeDwellMap = useRef(new Map())

  // Keep a stable reference to recipes for use inside observer callbacks
  // without needing to re-create the observer when the array reference changes.
  const recipesRef = useRef(recipes)
  useEffect(() => {
    recipesRef.current = recipes
  }, [recipes])

  // ── Main effect: create observer, attach to DOM, clean up on unmount ───────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Resolves the feed index for a given recipe_id.
     * O(n) but the feed is short-lived and recipes.length ≤ ~50.
     * @param {string} recipeId
     * @returns {number} 0-based index, or -1 if not found.
     */
    function getFeedIndex(recipeId) {
      return recipesRef.current.findIndex((r) => r.recipe_id === recipeId)
    }

    /**
     * Returns the recipe object for the given recipe_id, or null.
     * @param {string} recipeId
     * @returns {object|null}
     */
    function getRecipe(recipeId) {
      return recipesRef.current.find((r) => r.recipe_id === recipeId) ?? null
    }

    /**
     * Stops the running heartbeat interval and resets the sequence counter.
     */
    function clearHeartbeat() {
      if (heartbeatIntervalId.current !== null) {
        clearInterval(heartbeatIntervalId.current)
        heartbeatIntervalId.current = null
      }
      heartbeatSequence.current = 0
    }

    /**
     * Finalises dwell time for a card that is about to leave view (either
     * because a new card has taken over, or because the old card exited).
     *
     * @param {string} recipeId - The recipe_id that is leaving view.
     * @param {number} [exitRatio=0] - The intersection ratio at the moment of exit.
     */
    function finaliseDwell(recipeId, exitRatio = 0) {
      if (!entryTimestamp.current) return

      const dwell_time_ms = Date.now() - entryTimestamp.current

      // Accumulate into the cumulative map
      const prev = cumulativeDwellMap.current.get(recipeId) ?? 0
      const cumulative = prev + dwell_time_ms
      cumulativeDwellMap.current.set(recipeId, cumulative)

      const feedIndex = getFeedIndex(recipeId)

      dispatchTelemetry(EVENT_TYPES.IMPRESSION_HEARTBEAT, {
        recipe_id:                recipeId,
        feed_index:               feedIndex,
        dwell_time_ms,
        cumulative_dwell_ms:      cumulative,
        viewport_visibility_ratio: exitRatio,
        heartbeat_sequence:       heartbeatSequence.current,
        card_format:              CARD_FORMATS.STANDARD,
        is_above_fold:            feedIndex === 0,
        event_subtype:            'dwell_finalise',
      })

      entryTimestamp.current = null
    }

    /**
     * Starts a periodic IMPRESSION_HEARTBEAT interval for the given card.
     * Increments `heartbeatSequence` on each tick and includes current
     * cumulative dwell time in the payload.
     *
     * @param {string} recipeId   - The recipe_id to track.
     * @param {number} entryRatio - The intersection ratio at entry (0.0–1.0).
     */
    function startHeartbeat(recipeId, entryRatio) {
      const feedIndex = getFeedIndex(recipeId)

      heartbeatIntervalId.current = setInterval(() => {
        if (!entryTimestamp.current) return

        heartbeatSequence.current += 1
        const elapsed    = Date.now() - entryTimestamp.current
        const cumulative = (cumulativeDwellMap.current.get(recipeId) ?? 0) + elapsed

        dispatchTelemetry(EVENT_TYPES.IMPRESSION_HEARTBEAT, {
          recipe_id:                 recipeId,
          feed_index:                feedIndex,
          dwell_time_ms:             elapsed,
          cumulative_dwell_ms:       cumulative,
          viewport_visibility_ratio: entryRatio,
          heartbeat_sequence:        heartbeatSequence.current,
          card_format:               CARD_FORMATS.STANDARD,
          is_above_fold:             feedIndex === 0,
          event_subtype:             'heartbeat_tick',
        })
      }, HEARTBEAT_INTERVAL_MS)
    }

    // ── IntersectionObserver callback ────────────────────────────────────────

    /**
     * @param {IntersectionObserverEntry[]} entries
     */
    function handleIntersection(entries) {
      for (const entry of entries) {
        const el       = entry.target
        const recipeId = el.dataset.recipeId

        if (!recipeId) continue

        const isVisible = entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD

        if (isVisible) {
          // ── Card entering view ───────────────────────────────────────────

          // If a different card was active, finalise its dwell first
          if (activeRecipeId.current && activeRecipeId.current !== recipeId) {
            finaliseDwell(activeRecipeId.current, 0)
            clearHeartbeat()
          }

          // Only start fresh tracking if this card isn't already active
          if (activeRecipeId.current !== recipeId) {
            activeRecipeId.current  = recipeId
            entryTimestamp.current  = Date.now()
            heartbeatSequence.current = 0

            startHeartbeat(recipeId, entry.intersectionRatio)
          }
        } else {
          // ── Card leaving view ────────────────────────────────────────────

          if (activeRecipeId.current === recipeId) {
            finaliseDwell(recipeId, entry.intersectionRatio)
            clearHeartbeat()
            activeRecipeId.current = null
          }
        }
      }
    }

    // ── Observer setup ───────────────────────────────────────────────────────

    const observer = new IntersectionObserver(handleIntersection, {
      root:       container,
      threshold:  [0, VISIBILITY_THRESHOLD, 1.0],
    })

    // Observe all feed-card elements currently rendered in the container
    const cards = container.querySelectorAll('.feed-card')
    cards.forEach((card) => observer.observe(card))

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      // Finalise any in-progress dwell event before tearing down
      if (activeRecipeId.current) {
        finaliseDwell(activeRecipeId.current, 0)
      }
      clearHeartbeat()
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef])
  // NOTE: intentionally omitting `recipes` from the dep array. The observer is
  // set up once per container mount. `recipesRef` provides live access to the
  // current recipes array inside the stable callback without triggering
  // observer re-creation (which would produce infinite re-renders).
}
