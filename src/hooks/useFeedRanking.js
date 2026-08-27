/**
 * @fileoverview useFeedRanking — Phase 4, Pass 2
 *
 * Static Session Ranking Hook.
 *
 * Runs a single ranking pass on mount using historical analytics data.
 * The feed queue is set once and never mutated during the session —
 * removing the background re-ranking listener in favour of a simpler,
 * predictable model that avoids mid-scroll queue mutations.
 *
 * Exported interface:
 *  { feedQueue }
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps.
 *  - Fully defensive: empty analytics data, missing vector keys, or an
 *    exhausted catalogue all degrade gracefully with no UI crash.
 *
 * @module useFeedRanking
 */

import { useState, useEffect } from 'react'
import mockRecipes from '../data/mockRecipes.json'
import { generateUserAffinityVector } from '../analytics/affinityModel.js'
import { getLatestAnalyticsData } from '../analytics/sessionTransformer.js'
import { generateRankedFeed } from '../engine/rankingEngine.js'

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

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
 * Custom hook that provides a statically ranked recipe feed queue.
 * The ranking runs once on mount using historical analytics data;
 * the queue is never mutated mid-session.
 *
 * @returns {{ feedQueue: object[] }}
 */
export function useFeedRanking() {
  // ── State ──────────────────────────────────────────────────────────────────

  /**
   * The ordered queue of recipe objects rendered by the feed.
   * Initialised as the full catalogue; replaced once on mount by the
   * affinity-ranked list.
   *
   * @type {[object[], React.Dispatch<React.SetStateAction<object[]>>]}
   */
  const [feedQueue, setFeedQueue] = useState(mockRecipes)

  // ── Single mount effect — static session ranking ───────────────────────────

  useEffect(() => {
    // Fetch historical analytics from previous sessions (localStorage)
    const { impressions } = getLatestAnalyticsData()

    // Derive the set of recipe_ids seen across all prior sessions
    const seenRecipeIds = extractSeenRecipeIds(impressions)

    // Build a cuisine affinity vector from engagement signals
    const affinityVector = generateUserAffinityVector()

    // Generate a ranked list of unseen (and seen) candidates
    const rankedCandidates = generateRankedFeed(mockRecipes, affinityVector, seenRecipeIds)

    // Update the queue; fall back to the full catalogue if everything was seen
    setFeedQueue(rankedCandidates.length > 0 ? rankedCandidates : mockRecipes)
  }, []) // intentionally empty — runs exactly once on mount

  // ── Return interface ───────────────────────────────────────────────────────

  return { feedQueue }
}
