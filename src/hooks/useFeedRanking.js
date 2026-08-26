/**
 * @fileoverview useFeedRanking — Phase 4, Pass 1
 *
 * Dynamic Feed Ranking Hook.
 *
 * Manages the ordered recipe queue shown in the snap-scroll feed. On first
 * mount the queue is initialised with a shuffled cold-start list. Whenever
 * high-signal telemetry events arrive (`INGREDIENT_INTERACTION` or
 * `RECIPE_EXPAND`) the queue is silently re-ranked in the background so the
 * next cards the user reaches reflect their up-to-date affinity profile.
 *
 * Exported interface:
 *  { feedQueue, currentIndex, setCurrentIndex }
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps.
 *  - Fully defensive: empty analytics data, missing vector keys, or an
 *    exhausted catalogue all degrade gracefully with no UI crash.
 *  - Debounced recalculation (300 ms) prevents thrashing during rapid
 *    ingredient interactions while still updating well before the user
 *    scrolls to the next card.
 *
 * @module useFeedRanking
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import mockRecipes from '../data/mockRecipes.json'
import { generateUserAffinityVector } from '../analytics/affinityModel.js'
import { getLatestAnalyticsData } from '../analytics/sessionTransformer.js'
import { generateRankedFeed } from '../engine/rankingEngine.js'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Debounce delay (ms) applied to background recalculation triggers. */
const RECALC_DEBOUNCE_MS = 300

/**
 * Telemetry event types that carry enough signal to warrant a re-rank.
 * Only these two event types trigger a background queue update.
 */
const HIGH_SIGNAL_EVENTS = new Set(['INGREDIENT_INTERACTION', 'RECIPE_EXPAND'])

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Returns a new array containing the same elements as `arr` in a uniformly
 * random order (Fisher-Yates / Knuth shuffle). Does NOT mutate the original.
 *
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffleArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return []
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Extracts a deduplicated array of `recipe_id` strings from an impressions
 * array produced by `getLatestAnalyticsData`.
 *
 * @param {object[]} impressions
 * @returns {string[]}
 */
function extractSeenRecipeIds(impressions) {
  if (!Array.isArray(impressions)) return []
  const seen = new Set()
  for (const impression of impressions) {
    if (impression?.recipe_id) seen.add(impression.recipe_id)
  }
  return [...seen]
}

// =============================================================================
// HOOK — useFeedRanking
// =============================================================================

/**
 * Custom hook that provides a dynamically ranked recipe feed queue.
 *
 * @param {number} [initialIndex=0] - The feed index to initialise `currentIndex`
 *                                    with. Useful when restoring scroll position.
 *
 * @returns {{
 *   feedQueue:        object[],
 *   currentIndex:     number,
 *   setCurrentIndex:  React.Dispatch<React.SetStateAction<number>>,
 * }}
 */
export function useFeedRanking(initialIndex = 0) {
  // ── State ──────────────────────────────────────────────────────────────────

  /**
   * The ordered queue of recipe objects rendered by the feed.
   * Initialised as a cold-start shuffle of the full catalogue.
   *
   * @type {[object[], React.Dispatch<React.SetStateAction<object[]>>]}
   */
  const [feedQueue, setFeedQueue] = useState(() => shuffleArray(mockRecipes))

  /**
   * Zero-based index of the recipe card currently snapped into view.
   * Drives the "already viewed" prefix preservation during re-ranks.
   *
   * @type {[number, React.Dispatch<React.SetStateAction<number>>]}
   */
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  // ── Mutable refs for stale-closure-safe reads inside callbacks ─────────────

  /**
   * Mirror of `feedQueue` kept in a ref so the recalculate callback can read
   * the latest queue without being listed as a dependency (which would force
   * event-listener teardown/reattachment on every queue update).
   *
   * @type {React.MutableRefObject<object[]>}
   */
  const feedQueueRef = useRef(feedQueue)
  useEffect(() => {
    feedQueueRef.current = feedQueue
  }, [feedQueue])

  /**
   * Mirror of `currentIndex` kept in a ref for the same reason.
   *
   * @type {React.MutableRefObject<number>}
   */
  const currentIndexRef = useRef(currentIndex)
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  // ── Background re-ranking callback ─────────────────────────────────────────

  /**
   * Reads the latest analytics snapshot, derives an up-to-date affinity vector,
   * and splices a freshly ranked unseen-recipe tail into the queue — preserving
   * the cards the user has already scrolled past so their current position in
   * the feed is not disrupted.
   *
   * Reads `feedQueueRef` and `currentIndexRef` instead of state directly, so
   * the function identity is stable (no state deps) and the event listener does
   * not need to be torn down and re-attached on every render.
   */
  const recalculateQueue = useCallback(() => {
    // Fetch latest analytics data (reads from localStorage)
    const { impressions } = getLatestAnalyticsData()

    // Derive the set of recipe_ids the user has already seen
    const seenRecipeIds = extractSeenRecipeIds(impressions)

    // Build the current affinity vector from engagement signals
    const affinityVector = generateUserAffinityVector()

    // Generate ranked unseen candidates
    const rankedUnseen = generateRankedFeed(mockRecipes, affinityVector, seenRecipeIds)

    // Splice: keep the viewed prefix intact, append new ranked tail.
    // Read the latest values via refs to avoid stale closures.
    const prevQueue   = feedQueueRef.current
    const prevIdx     = currentIndexRef.current
    const viewedPrefix = prevQueue.slice(0, prevIdx + 1)
    const nextQueue    = [...viewedPrefix, ...rankedUnseen]

    setFeedQueue(nextQueue)
  }, []) // stable — reads only refs and imports, no state deps

  // ── Global event listener ─────────────────────────────────────────────────

  useEffect(() => {
    let debounceTimer = null

    /**
     * Handles `culinaryfeed:telemetry` custom events dispatched on `window`.
     * Only reacts to high-signal event types; ignores all others to avoid
     * unnecessary recalculation on every heartbeat tick.
     *
     * @param {CustomEvent} event
     */
    function handleTelemetryEvent(event) {
      const eventType = event?.detail?.eventType
      if (!HIGH_SIGNAL_EVENTS.has(eventType)) return

      // Debounce: cancel any pending recalculation and restart the timer so
      // that rapid interactions (e.g. checking multiple ingredients in quick
      // succession) are coalesced into a single background recalc.
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        recalculateQueue()
      }, RECALC_DEBOUNCE_MS)
    }

    window.addEventListener('culinaryfeed:telemetry', handleTelemetryEvent)

    return () => {
      window.removeEventListener('culinaryfeed:telemetry', handleTelemetryEvent)
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
    }
  }, [recalculateQueue])

  // ── Return interface ───────────────────────────────────────────────────────

  return { feedQueue, currentIndex, setCurrentIndex }
}
