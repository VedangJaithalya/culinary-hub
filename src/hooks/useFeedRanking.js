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
import { getDismissedRecipeIds } from '../services/dismissService.js'

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

    // Derive the set of recipe_ids seen across all prior sessions, plus any
    // explicitly dismissed ("not interested") recipes — dismissals are a
    // permanent exclusion from candidate generation, not just a down-rank,
    // so they're unioned into the same exclusion set rather than merely
    // scored lower. See dismissService.js / Smarter Ranking item 6.
    const seenRecipeIds = [
      ...new Set([...extractSeenRecipeIds(impressions), ...getDismissedRecipeIds()]),
    ]

    // Build the multi-dimensional affinity profile (cuisine, difficulty,
    // dietary, tags + UCB1 impression-count metadata) from engagement
    // signals — see affinityModel.js's Smarter Ranking rewrite.
    const affinityProfile = generateUserAffinityVector()

    // Generate a ranked, diversity-constrained list of unseen candidates.
    // Dietary preference now flows entirely through affinityProfile.dietary
    // rather than a separate flat bonus parameter.
    const rankedCandidates = generateRankedFeed(mockRecipes, affinityProfile, seenRecipeIds)

    // Update the queue; fall back to the full catalogue if everything was seen.
    // Intentional one-time sync on mount (empty dep array, see below) rather
    // than a reaction to a prop change — the documented valid case for
    // setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeedQueue(rankedCandidates.length > 0 ? rankedCandidates : mockRecipes)
  }, []) // intentionally empty — runs exactly once on mount

  // ── Return interface ───────────────────────────────────────────────────────

  return { feedQueue }
}
