/**
 * @fileoverview CulinaryFeed Telemetry Service — Phase 2, Pass 2
 *
 * Manages the client-side telemetry pipeline:
 *  1. Resolves / initialises a session ID in sessionStorage.
 *  2. Wraps every raw payload in a fully-populated EventEnvelope.
 *  3. Buffers events in memory and persists the last 500 to localStorage.
 *  4. Logs structured debug output to the browser console.
 *  5. Notifies any in-page subscribers via a custom DOM event.
 *
 * This module is pure ES6 — no React dependency — so it can be imported
 * by hooks, utilities, and non-React workers without coupling concerns.
 *
 * @module telemetryService
 */

import {
  generateUUID,
  nowISO,
  buildEventEnvelope,
  EVENT_TYPES,
  APP_VERSION,
  SCHEMA_VERSION,
} from '../data/dataContracts.js'

// =============================================================================
// CONSTANTS
// =============================================================================

const SESSION_KEY    = 'culinaryfeed_session_id'
const EVENTS_KEY     = 'culinaryfeed_events'
const BUFFER_MAX     = 500
const GUEST_USER_ID  = 'usr_guest_01'
const DOM_EVENT_NAME = 'culinaryfeed:telemetry'

// =============================================================================
// SESSION ID
// Resolution order: sessionStorage → generate + persist
// =============================================================================

function resolveSessionId() {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
      sid = generateUUID()
      sessionStorage.setItem(SESSION_KEY, sid)
    }
    return sid
  } catch {
    // sessionStorage may be blocked in private-browsing or sandboxed iframes
    return generateUUID()
  }
}

const SESSION_ID = resolveSessionId()

// =============================================================================
// PLATFORM CONTEXT
// Captured once at module load; stable for the life of the page.
// =============================================================================

function resolvePlatformContext() {
  const ua = navigator.userAgent

  // Coarse device type from viewport width
  const width = window.innerWidth
  const deviceType = width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'

  // OS heuristics
  let os = 'unknown'
  if (/iPhone|iPad|iPod/.test(ua))       os = 'iOS'
  else if (/Android/.test(ua))           os = 'Android'
  else if (/Mac/.test(ua))               os = 'macOS'
  else if (/Win/.test(ua))               os = 'Windows'
  else if (/Linux/.test(ua))             os = 'Linux'

  // Browser family heuristics (order matters — Edge before Chrome, etc.)
  let browser = 'unknown'
  if (/Edg\//.test(ua))                  browser = 'Edge'
  else if (/OPR\//.test(ua))             browser = 'Opera'
  else if (/Firefox\//.test(ua))         browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari'
  else if (/Chrome\//.test(ua))          browser = 'Chrome'

  // Network Information API (best-effort)
  const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection
  const networkType = conn?.effectiveType ?? 'unknown'

  return {
    deviceType,
    os,
    browser,
    networkType,
    viewportWidthPx:  window.innerWidth,
    viewportHeightPx: window.innerHeight,
  }
}

const PLATFORM_CONTEXT = resolvePlatformContext()

// =============================================================================
// IN-MEMORY EVENT BUFFER
// =============================================================================

/** @type {Array<import('../data/dataContracts.js').EventEnvelope>} */
let eventBuffer = []

// Hydrate from localStorage on first load so a page reload doesn't lose data
try {
  const stored = localStorage.getItem(EVENTS_KEY)
  if (stored) {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      eventBuffer = parsed.slice(-BUFFER_MAX)
    }
  }
} catch {
  // localStorage unavailable or corrupted — start with an empty buffer
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Resolves the current user ID.
 * Checks localStorage for a persisted user ID; falls back to the guest default.
 *
 * @returns {string}
 */
function resolveUserId() {
  try {
    return localStorage.getItem('culinaryfeed_user_id') ?? GUEST_USER_ID
  } catch {
    return GUEST_USER_ID
  }
}

/**
 * Flushes the in-memory buffer to localStorage, keeping only the last
 * BUFFER_MAX events to avoid storage bloat.
 */
function persistBuffer() {
  try {
    const slice = eventBuffer.slice(-BUFFER_MAX)
    localStorage.setItem(EVENTS_KEY, JSON.stringify(slice))
  } catch (err) {
    // localStorage quota exceeded or blocked — silently continue
    console.warn('[Telemetry] localStorage persist failed:', err.message)
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Builds a fully-populated EventEnvelope for `eventName`, pushes it to the
 * in-memory buffer, persists to localStorage, emits a console log, and
 * dispatches a custom DOM event for in-page subscribers.
 *
 * @param {string} eventName    One of EVENT_TYPES values.
 * @param {object} customPayload Event-type-specific payload object.
 * @returns {import('../data/dataContracts.js').EventEnvelope} The dispatched envelope.
 */
export function dispatchTelemetry(eventName, customPayload) {
  const userId = resolveUserId()

  const eventEnvelope = buildEventEnvelope({
    eventType:     eventName,
    sessionId:     SESSION_ID,
    userId,
    appVersion:    APP_VERSION,
    platform:      PLATFORM_CONTEXT,
    payload:       {
      ...customPayload,
      timestamp_ms: Date.now(),
    },
    schemaVersion: SCHEMA_VERSION,
  })

  // ── 1. Push to in-memory buffer ──────────────────────────────────────────
  eventBuffer.push(eventEnvelope)

  // ── 2. Persist last BUFFER_MAX events to localStorage ───────────────────
  persistBuffer()

  // ── 3. Structured console debug ──────────────────────────────────────────
  console.log(
    `%c[Telemetry] ${eventName}`,
    'color: #a78bfa; font-weight: bold;',
    {
      eventId:    eventEnvelope.eventId,
      sessionId:  SESSION_ID,
      userId,
      payload:    customPayload,
    }
  )

  // ── 4. Custom DOM event for in-page subscribers ──────────────────────────
  try {
    window.dispatchEvent(
      new CustomEvent(DOM_EVENT_NAME, {
        detail: eventEnvelope,
        bubbles: false,
        cancelable: false,
      })
    )
  } catch (err) {
    console.warn('[Telemetry] CustomEvent dispatch failed:', err.message)
  }

  return eventEnvelope
}

/**
 * Returns a shallow copy of the current in-memory event buffer.
 * Safe to iterate without mutating the internal queue.
 *
 * @returns {Array<import('../data/dataContracts.js').EventEnvelope>}
 */
export function getTelemetryBuffer() {
  return [...eventBuffer]
}

/**
 * Clears the in-memory buffer AND removes the persisted localStorage entry.
 * Useful for testing, logout flows, and privacy-reset scenarios.
 */
export function clearTelemetryBuffer() {
  eventBuffer = []
  try {
    localStorage.removeItem(EVENTS_KEY)
  } catch {
    // noop
  }
  console.log('%c[Telemetry] buffer cleared', 'color: #f87171; font-weight: bold;')
}

/**
 * Serialises the current buffer to a JSON string suitable for download /
 * server flush. Includes a top-level metadata wrapper.
 *
 * @returns {string} Formatted JSON string.
 */
export function exportTelemetryJSON() {
  const exportPayload = {
    exportedAt: nowISO(),
    sessionId:  SESSION_ID,
    eventCount: eventBuffer.length,
    events:     eventBuffer,
  }
  return JSON.stringify(exportPayload, null, 2)
}

// Re-export EVENT_TYPES so callers only need one import path
export { EVENT_TYPES }
