/**
 * @fileoverview CulinaryFeed Session Transformer — Phase 3, Pass 1
 *
 * Telemetry Transformation and Session Reconstruction.
 *
 * Reads raw EventEnvelope arrays (from localStorage or in-memory) and
 * reconstructs two analytics fact-table shapes:
 *
 *  - `fact_feed_sessions`    — One record per discrete feed session.
 *  - `fact_feed_impressions` — One record per recipe seen within a session.
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps.
 *  - Fully defensive: every payload field access is null-coalesced so malformed
 *    or partially-written events are silently skipped rather than crashing.
 *  - Idempotent: calling `transformRawEvents` on the same input always returns
 *    the same output (no side effects beyond the DevTools binding at the bottom).
 *
 * @module sessionTransformer
 */

import { EVENT_TYPES } from '../data/dataContracts.js'
import mockRecipes from '../data/mockRecipes.json'

// =============================================================================
// MODULE-LEVEL LOOKUP TABLE
// Pre-index mockRecipes by recipe_id so per-event lookups are O(1).
// =============================================================================

/**
 * @type {Map<string, { cuisine_id: string|null, total_ingredients: number }>}
 */
const recipeMetaMap = new Map(
  mockRecipes.map((r) => [
    r.recipe_id,
    {
      cuisine_id:        r.cuisine_id ?? null,
      total_ingredients: Array.isArray(r.ingredients) ? r.ingredients.length : 0,
    },
  ])
)

// =============================================================================
// MAIN EXPORT — transformRawEvents
// =============================================================================

/**
 * Transforms a flat array of raw telemetry EventEnvelopes into analytics
 * fact-table records grouped by session.
 *
 * Processing steps per session (chronological):
 *  1. Collect and sort events by `payload.timestamp_ms` (ascending).
 *  2. Derive per-recipe impression metrics (max dwell, expand flag, ingredient checks).
 *  3. Assemble one `fact_feed_impressions` row per recipe_id seen.
 *  4. Assemble one `fact_feed_sessions` row summarising the entire session.
 *
 * @param {object[]} eventsArray - Array of EventEnvelope objects. May be empty.
 * @returns {{ sessions: object[], impressions: object[] }}
 */
export function transformRawEvents(eventsArray) {
  // Guard: must be a non-empty array
  if (!Array.isArray(eventsArray) || eventsArray.length === 0) {
    return { sessions: [], impressions: [] }
  }

  // ── Step 1: Group events by session_id ─────────────────────────────────────

  /** @type {Map<string, object[]>} */
  const sessionMap = new Map()

  for (const event of eventsArray) {
    // Defensively skip events without a session_id
    const sid = event?.sessionId
    if (!sid) continue

    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, [])
    }
    sessionMap.get(sid).push(event)
  }

  // ── Step 2: Process each session ──────────────────────────────────────────

  const allSessions    = []
  const allImpressions = []

  for (const [sessionId, events] of sessionMap) {
    // Sort events chronologically using payload.timestamp_ms; fall back to
    // clientTs epoch ms if the payload field is absent.
    events.sort((a, b) => {
      const tsA = a?.payload?.timestamp_ms ?? new Date(a?.clientTs ?? 0).getTime()
      const tsB = b?.payload?.timestamp_ms ?? new Date(b?.clientTs ?? 0).getTime()
      return tsA - tsB
    })

    // ── Intermediate state ──────────────────────────────────────────────────

    /** Earliest timestamp seen in this session (ms epoch) */
    let minTs = Infinity
    /** Latest timestamp seen in this session (ms epoch) */
    let maxTs = -Infinity

    /** user_id from the first event in the session */
    const userId = events[0]?.userId ?? null

    /**
     * Per-recipe impression metrics dictionary.
     * @type {Map<string, {
     *   max_dwell_ms: number,
     *   is_expanded: boolean,
     *   dwell_before_expand_ms: number|null,
     *   is_liked: boolean,
     *   is_saved: boolean,
     * }>}
     */
    const recipeMetrics = new Map()

    /**
     * Per-recipe checked ingredient Sets.
     * Net state: add on 'checked', delete on 'unchecked'.
     * @type {Map<string, Set<string>>}
     */
    const ingredientState = new Map()

    // ── Step 3: Walk events chronologically ──────────────────────────────────

    for (const event of events) {
      const eventType = event?.eventType
      const payload   = event?.payload ?? {}

      // Update global min/max from payload timestamp
      const ts = payload.timestamp_ms
      if (typeof ts === 'number') {
        if (ts < minTs) minTs = ts
        if (ts > maxTs) maxTs = ts
      }

      const recipeId = payload.recipe_id
      if (!recipeId) continue  // events without a recipe context are skipped

      // Ensure the recipe has an entry in both dictionaries
      if (!recipeMetrics.has(recipeId)) {
        recipeMetrics.set(recipeId, {
          max_dwell_ms:           0,
          is_expanded:            false,
          dwell_before_expand_ms: null,
          is_liked:               false,
          is_saved:               false,
          is_dismissed:           false,
          last_event_ts_ms:       null,
        })
      }
      if (!ingredientState.has(recipeId)) {
        ingredientState.set(recipeId, new Set())
      }

      const metrics = recipeMetrics.get(recipeId)

      // Track the most recent timestamp seen for this recipe within the
      // session, regardless of event type — feeds affinityModel's recency
      // time-decay so older signal fades relative to more recent signal.
      if (typeof ts === 'number' && (metrics.last_event_ts_ms == null || ts > metrics.last_event_ts_ms)) {
        metrics.last_event_ts_ms = ts
      }

      // ── Handle each event type ──────────────────────────────────────────────

      if (eventType === EVENT_TYPES.IMPRESSION_HEARTBEAT) {
        // Update max cumulative dwell for this recipe
        const cumulativeMs = payload.cumulative_dwell_ms
        if (typeof cumulativeMs === 'number' && cumulativeMs > metrics.max_dwell_ms) {
          metrics.max_dwell_ms = cumulativeMs
        }

      } else if (eventType === EVENT_TYPES.RECIPE_EXPAND) {
        metrics.is_expanded = true
        // Record the dwell elapsed before the user tapped expand
        const dwellBeforeExpand = payload.dwell_before_expand_ms
        if (typeof dwellBeforeExpand === 'number') {
          metrics.dwell_before_expand_ms = dwellBeforeExpand
        }

      } else if (eventType === EVENT_TYPES.INGREDIENT_INTERACTION) {
        const ingredientId = payload.ingredient_id
        const action       = payload.action

        if (ingredientId && action) {
          const ingSet = ingredientState.get(recipeId)
          if (action === 'checked') {
            ingSet.add(ingredientId)
          } else if (action === 'unchecked') {
            ingSet.delete(ingredientId)
          }
        }

      } else if (eventType === EVENT_TYPES.RECIPE_LIKE) {
        // Toggle: each RECIPE_LIKE event represents the current liked state
        // from the payload; fall back to flipping the flag if payload absent.
        metrics.is_liked = payload.is_liked ?? !metrics.is_liked

      } else if (eventType === EVENT_TYPES.RECIPE_SAVE) {
        // Toggle: each RECIPE_SAVE event represents the current saved state.
        metrics.is_saved = payload.is_saved ?? !metrics.is_saved

      } else if (eventType === EVENT_TYPES.RECIPE_DISMISS) {
        // One-directional: once dismissed within a session, stays dismissed.
        metrics.is_dismissed = true
      }
    }

    // Guard: if we never saw a valid timestamp, default to 0
    if (minTs === Infinity)  minTs = 0
    if (maxTs === -Infinity) maxTs = 0

    // ── Step 4: Build fact_feed_impressions rows ───────────────────────────

    for (const [recipeId, metrics] of recipeMetrics) {
      const ingSet             = ingredientState.get(recipeId) ?? new Set()
      const recipeMeta         = recipeMetaMap.get(recipeId) ?? { cuisine_id: null, total_ingredients: 0 }
      const ingredientsChecked = ingSet.size
      const totalIngredients   = recipeMeta.total_ingredients

      const isSkipped       = metrics.max_dwell_ms < 2000 && !metrics.is_expanded
      const isCompletedPrep = ingredientsChecked > 0 && ingredientsChecked === totalIngredients

      allImpressions.push({
        session_id:                sessionId,
        user_id:                   userId,
        recipe_id:                 recipeId,
        cuisine_id:                recipeMeta.cuisine_id,
        dwell_time_ms:             metrics.max_dwell_ms,
        is_expanded:               metrics.is_expanded,
        dwell_before_expand_ms:    metrics.dwell_before_expand_ms,
        total_ingredients:         totalIngredients,
        ingredients_checked_count: ingredientsChecked,
        is_skipped:                isSkipped,
        is_completed_prep:         isCompletedPrep,
        is_liked:                  metrics.is_liked,
        is_saved:                  metrics.is_saved,
        is_dismissed:              metrics.is_dismissed,
        last_event_ts_ms:          metrics.last_event_ts_ms,
      })
    }

    // ── Step 5: Build fact_feed_sessions row ──────────────────────────────

    const totalExpandsCount = [...recipeMetrics.values()].filter((m) => m.is_expanded).length
    const totalIngredientsChecked = [...ingredientState.values()].reduce(
      (sum, ingSet) => sum + ingSet.size,
      0
    )

    allSessions.push({
      session_id:                sessionId,
      user_id:                   userId,
      session_start_at:          minTs > 0 ? new Date(minTs).toISOString() : null,
      session_end_at:            maxTs > 0 ? new Date(maxTs).toISOString() : null,
      session_duration_sec:      maxTs > minTs ? (maxTs - minTs) / 1000 : 0,
      total_impressions_count:   recipeMetrics.size,
      total_expands_count:       totalExpandsCount,
      total_ingredients_checked: totalIngredientsChecked,
    })
  }

  return { sessions: allSessions, impressions: allImpressions }
}

// =============================================================================
// HELPER — getLatestAnalyticsData
// =============================================================================

/**
 * Reads the persisted telemetry event buffer from localStorage, safely parses
 * it, and returns the transformed analytics data.
 *
 * Falls back to an empty array on any parse failure so the caller always
 * receives a valid `{ sessions, impressions }` object.
 *
 * @returns {{ sessions: object[], impressions: object[] }}
 */
export function getLatestAnalyticsData() {
  let eventsArray = []

  try {
    const raw = localStorage.getItem('culinaryfeed_events')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        eventsArray = parsed
      }
    }
  } catch {
    // localStorage unavailable or JSON malformed — return empty transform
  }

  return transformRawEvents(eventsArray)
}

// =============================================================================
// VALIDATION — debugPrintAnalyticsSummary
// =============================================================================

/**
 * Prints a formatted analytics summary to the browser console using grouped
 * tables. Intended for manual QA and developer debugging only.
 *
 * Usage (browser DevTools console):
 *   debugAnalytics()
 */
export function debugPrintAnalyticsSummary() {
  const data = getLatestAnalyticsData()

  console.group('CulinaryFeed Analytics Summary')
  console.log(`Sessions   : ${data.sessions.length}`)
  console.log(`Impressions: ${data.impressions.length}`)
  console.table(data.sessions)
  console.table(data.impressions)
  console.groupEnd()
}

// =============================================================================
// GLOBAL DEVTOOLS BINDING
// Attaches `window.debugAnalytics` so any engineer can call it from the
// browser console without any imports.
// =============================================================================

if (typeof window !== 'undefined') {
  window.debugAnalytics = debugPrintAnalyticsSummary
}
