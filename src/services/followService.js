/**
 * @fileoverview followService — creator follow/unfollow persistence.
 *
 * Every recipe already carries a `creator_user_id`, but nothing in the app
 * lets a user act on it. This module persists the set of followed creator
 * IDs in localStorage and dispatches CREATOR_FOLLOW / CREATOR_UNFOLLOW
 * telemetry, mirroring the like/save pattern already used in FeedCard.js.
 *
 * @module followService
 */

import { dispatchTelemetry } from './telemetryService.js'
import { EVENT_TYPES } from '../data/dataContracts.js'

const FOLLOWS_KEY = 'culinaryfeed_followed_creators'

function readFollowedIds() {
  try {
    const raw = localStorage.getItem(FOLLOWS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeFollowedIds(ids) {
  try {
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(ids))
  } catch {
    // localStorage unavailable — in-memory caller state still updates.
  }
}

/**
 * Returns the full list of currently-followed creator IDs.
 * @returns {string[]}
 */
export function getFollowedCreatorIds() {
  return readFollowedIds()
}

/**
 * @param {string} creatorId
 * @returns {boolean}
 */
export function isFollowingCreator(creatorId) {
  return readFollowedIds().includes(creatorId)
}

/**
 * Toggles the follow state for a creator, persists it, and dispatches the
 * matching telemetry event.
 *
 * @param {string} creatorId
 * @returns {boolean} The new following state.
 */
export function toggleFollowCreator(creatorId) {
  const current = readFollowedIds()
  const isFollowing = current.includes(creatorId)
  const next = isFollowing
    ? current.filter((id) => id !== creatorId)
    : [...new Set([...current, creatorId])]

  writeFollowedIds(next)

  dispatchTelemetry(
    isFollowing ? EVENT_TYPES.CREATOR_UNFOLLOW : EVENT_TYPES.CREATOR_FOLLOW,
    { creator_id: creatorId }
  )

  return !isFollowing
}
