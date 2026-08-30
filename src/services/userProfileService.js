/**
 * @fileoverview userProfileService — cold-start onboarding profile.
 *
 * Persists the lightweight `DimUser`-shaped preference profile collected by
 * the first-run onboarding survey (preferred cuisines, dietary flags, skill
 * level). Consumed by `affinityModel.js` to bias the cold-start affinity
 * vector and by `rankingEngine.js` to apply a small dietary-match bonus,
 * instead of both falling back to a flat uniform distribution for every
 * brand-new user.
 *
 * Pure ES6+ JavaScript — zero TypeScript, zero external runtime deps, and
 * fully defensive: a missing/blocked localStorage or malformed JSON always
 * degrades to "no profile" rather than throwing.
 *
 * @module userProfileService
 */

const PROFILE_KEY = 'culinaryfeed_user_profile'

/**
 * @typedef {object} UserProfile
 * @property {string[]} preferredCuisines  cuisine_id slugs chosen during onboarding.
 * @property {string[]} dietaryFlags       Dietary restriction strings, e.g. ['vegan'].
 * @property {string|null} skillLevel      'beginner'|'intermediate'|'advanced'|'professional'.
 * @property {string} completedAt          ISO-8601 UTC timestamp of onboarding completion.
 */

/**
 * Reads the persisted onboarding profile.
 *
 * @returns {UserProfile|null} The profile, or null if onboarding was never
 *   completed or the stored value is malformed.
 */
export function getUserProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      preferredCuisines: Array.isArray(parsed.preferredCuisines) ? parsed.preferredCuisines : [],
      dietaryFlags: Array.isArray(parsed.dietaryFlags) ? parsed.dietaryFlags : [],
      skillLevel: typeof parsed.skillLevel === 'string' ? parsed.skillLevel : null,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
    }
  } catch {
    return null
  }
}

/**
 * Returns true if the user has completed the onboarding survey at least once.
 * @returns {boolean}
 */
export function hasCompletedOnboarding() {
  return getUserProfile() !== null
}

/**
 * Persists a new onboarding profile, overwriting any previous one.
 *
 * @param {{ preferredCuisines?: string[], dietaryFlags?: string[], skillLevel?: string|null }} profile
 * @returns {UserProfile} The normalised profile that was saved.
 */
export function saveUserProfile({ preferredCuisines = [], dietaryFlags = [], skillLevel = null } = {}) {
  const normalised = {
    preferredCuisines: [...new Set(preferredCuisines)],
    dietaryFlags: [...new Set(dietaryFlags)],
    skillLevel,
    completedAt: new Date().toISOString(),
  }

  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(normalised))
  } catch {
    // localStorage unavailable — the in-memory return value still lets the
    // caller proceed for the current session.
  }

  return normalised
}

/**
 * Clears the persisted profile. Exposed for testing / "redo onboarding" flows.
 */
export function clearUserProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY)
  } catch {
    // noop
  }
}
