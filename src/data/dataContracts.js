/**
 * @fileoverview CulinaryFeed Data Contracts — Phase 1 Data Foundations
 *
 * Single source of truth for all entity models, telemetry payloads, and shared
 * constants used across the CulinaryFeed React application and its analytics layer.
 *
 * Design principles:
 *  - Pure ES6+ JavaScript — zero TypeScript syntax, no runtime dependencies.
 *  - All types documented via JSDoc @typedef / @property annotations so that
 *    VS Code / Vite provide full IntelliSense without a TypeScript compilation step.
 *  - All enumerated values are exported as frozen plain objects (Object.freeze)
 *    so they act as compile-time-safe constants with IDE autocomplete.
 *  - All factory functions are pure: given the same inputs they return the same output
 *    and produce no side effects.
 *
 * @module dataContracts
 * @version 1.0.0
 * @author CulinaryFeed Data Engineering Team
 * @since 2026-08-25
 */

// =============================================================================
// SECTION 1 — EXPORTED CONSTANT ENUMERATIONS
// =============================================================================

/**
 * Enumeration of all telemetry event type identifiers.
 * Each value maps to a top-level event_type discriminator in the event envelope
 * and corresponds to a contract definition in docs/event_contracts.json.
 *
 * @readonly
 * @enum {string}
 *
 * @example
 * import { EVENT_TYPES } from './dataContracts.js';
 * const eventType = EVENT_TYPES.RECIPE_EXPAND; // 'RECIPE_EXPAND'
 */
export const EVENT_TYPES = Object.freeze({
  /** Fires every 5s while a recipe card is ≥50% visible in the viewport. */
  IMPRESSION_HEARTBEAT: 'IMPRESSION_HEARTBEAT',

  /** Fires when the user taps/clicks a recipe card to open the detail view. */
  RECIPE_EXPAND: 'RECIPE_EXPAND',

  /**
   * Fires when the user performs any interaction with a specific ingredient
   * inside the recipe detail view (tap, substitute request, add to list, etc.).
   */
  INGREDIENT_INTERACTION: 'INGREDIENT_INTERACTION',

  /** Fires when the user likes (hearts) a recipe card from the feed action rail. */
  RECIPE_LIKE: 'RECIPE_LIKE',

  /** Fires when the user saves (bookmarks) a recipe card from the feed action rail. */
  RECIPE_SAVE: 'RECIPE_SAVE',

  /** Fires when the user completes the first-run cuisine/dietary onboarding survey. */
  ONBOARDING_COMPLETE: 'ONBOARDING_COMPLETE',

  /** Fires when the user submits or updates their own star rating for a recipe. */
  RATING_SUBMIT: 'RATING_SUBMIT',

  /** Fires when the user follows a recipe creator from a creator profile. */
  CREATOR_FOLLOW: 'CREATOR_FOLLOW',

  /** Fires when the user unfollows a recipe creator from a creator profile. */
  CREATOR_UNFOLLOW: 'CREATOR_UNFOLLOW',

  /** Fires when the user adds a recipe's ingredients to their shopping list. */
  INGREDIENT_ADD_TO_LIST: 'INGREDIENT_ADD_TO_LIST',

  /** Fires when the user enters step-by-step Cook Mode for a recipe. */
  RECIPE_COOK_START: 'RECIPE_COOK_START',

  /** Fires when the user completes the final step of Cook Mode for a recipe. */
  RECIPE_COOK_COMPLETE: 'RECIPE_COOK_COMPLETE',

  /**
   * Fires when the user explicitly dismisses a recipe from the feed
   * ("not interested"). Strong negative signal — see
   * `affinityModel.calculateImpressionScore`'s `dismissModifier`.
   */
  RECIPE_DISMISS: 'RECIPE_DISMISS',

  /**
   * Fires when the user shares a recipe (native share sheet or copy-link
   * fallback). ACTION_TYPES.RECIPE_SHARE already existed for this but no
   * matching EVENT_TYPES entry did, unlike every other tracked action.
   */
  RECIPE_SHARE: 'RECIPE_SHARE',
});

/**
 * Enumeration of all discrete user action types tracked in fact_user_actions.
 * These map directly to the fact_user_actions.action_type CHECK constraint values.
 *
 * @readonly
 * @enum {string}
 *
 * @example
 * import { ACTION_TYPES } from './dataContracts.js';
 * dispatchAction({ type: ACTION_TYPES.RECIPE_SAVE, recipeId });
 */
export const ACTION_TYPES = Object.freeze({
  // ── Recipe-level actions ──────────────────────────────────────────────────
  /** User opened/expanded a recipe card to full detail view. */
  RECIPE_EXPAND: 'recipe_expand',

  /** User closed/collapsed the recipe detail view back to the feed. */
  RECIPE_COLLAPSE: 'recipe_collapse',

  /** User bookmarked/saved a recipe to their collection. */
  RECIPE_SAVE: 'recipe_save',

  /** User removed a previously saved recipe from their collection. */
  RECIPE_UNSAVE: 'recipe_unsave',

  /** User shared a recipe via the native share sheet or a copy-link action. */
  RECIPE_SHARE: 'recipe_share',

  /**
   * User submitted an "I Made This" declaration — the highest-intent action,
   * signalling actual cooking completion. Increments dim_recipe.cook_count.
   */
  RECIPE_COOK: 'recipe_cook',

  // ── Ingredient-level actions ──────────────────────────────────────────────
  /** User tapped an ingredient to view its detail card. */
  INGREDIENT_TAP: 'ingredient_tap',

  /** User requested an ingredient substitution suggestion. */
  INGREDIENT_SUBSTITUTE_REQUEST: 'ingredient_substitute_request',

  /** User added an ingredient to their shopping/pantry list. */
  INGREDIENT_ADD_TO_LIST: 'ingredient_add_to_list',

  // ── Content feedback actions ──────────────────────────────────────────────
  /** User submitted a star rating (1–5) for a recipe. */
  RATING_SUBMIT: 'rating_submit',

  /** User submitted a text comment on a recipe. */
  COMMENT_SUBMIT: 'comment_submit',

  // ── Social / creator actions ──────────────────────────────────────────────
  /** User followed a recipe creator. */
  CREATOR_FOLLOW: 'creator_follow',

  /** User unfollowed a recipe creator. */
  CREATOR_UNFOLLOW: 'creator_unfollow',

  // ── Explicit negative feedback ─────────────────────────────────────────────
  /** User explicitly marked a recipe as "not interested" from the feed. */
  RECIPE_DISMISS: 'recipe_dismiss',
});

/**
 * Enumeration of all canonical ingredient category values.
 * Maps to dim_ingredient.category CHECK constraint and the
 * INGREDIENT_INTERACTION event contract's ingredient_category field.
 *
 * @readonly
 * @enum {string}
 *
 * @example
 * import { INGREDIENT_CATEGORIES } from './dataContracts.js';
 * const cat = INGREDIENT_CATEGORIES.SPICE; // 'spice'
 */
export const INGREDIENT_CATEGORIES = Object.freeze({
  /** Fresh fruits and vegetables. */
  PRODUCE: 'produce',

  /** Meat, poultry, seafood, eggs, and plant-based proteins (tofu, tempeh). */
  PROTEIN: 'protein',

  /** Milk, cheese, butter, cream, and dairy alternatives. */
  DAIRY: 'dairy',

  /** Shelf-stable items: canned goods, oils, vinegars, sweeteners, flour. */
  PANTRY: 'pantry',

  /** Dried spices, herbs, and spice blends. */
  SPICE: 'spice',

  /** Sauces, pastes, dressings, and condiments (miso, soy sauce, ketchup). */
  CONDIMENT: 'condiment',

  /** Grains, legumes, pasta, rice, and bread products. */
  GRAIN: 'grain',

  /** Alcoholic and non-alcoholic beverages used in cooking (wine, stock, juice). */
  BEVERAGE: 'beverage',

  /** Catch-all for ingredients that do not fit other categories. */
  OTHER: 'other',
});

/**
 * Enumeration of recipe difficulty tier values.
 * Maps to dim_recipe.difficulty_tier CHECK constraint and is used for
 * skill-level matching during feed personalisation and recipe filtering.
 *
 * NOTE: this previously listed 'medium'/'hard'/'expert', which never matched
 * the actual difficulty_tier values used by mockRecipes.json or read anywhere
 * in the app (easy/intermediate/advanced, e.g. FeedCard's tierColour map and
 * SKILL_LEVEL_TO_DIFFICULTY in affinityModel.js). Corrected to match reality.
 *
 * @readonly
 * @enum {string}
 *
 * @example
 * import { DIFFICULTY_TIERS } from './dataContracts.js';
 * const tier = DIFFICULTY_TIERS.INTERMEDIATE; // 'intermediate'
 */
export const DIFFICULTY_TIERS = Object.freeze({
  /**
   * Beginner-friendly recipes requiring minimal technique, equipment, or time.
   * Targets users with skill_level: 'beginner'.
   */
  EASY: 'easy',

  /**
   * Recipes requiring moderate skill — some knife work, heat management,
   * or multi-step processes. Targets 'beginner' to 'intermediate' users.
   */
  INTERMEDIATE: 'intermediate',

  /**
   * Advanced recipes with complex techniques, longer cook times, or specialised
   * equipment, targeting 'advanced'/'professional' users.
   */
  ADVANCED: 'advanced',
});

/**
 * Enumeration of user account type values.
 * Maps to dim_user.account_type CHECK constraint.
 *
 * @readonly
 * @enum {string}
 */
export const ACCOUNT_TYPES = Object.freeze({
  /** Unauthenticated session — pseudo-anonymous UUID, limited features. */
  ANONYMOUS: 'anonymous',

  /** Standard authenticated account with free-tier feature access. */
  REGISTERED: 'registered',

  /** Paid subscriber with access to premium content and features. */
  PREMIUM: 'premium',

  /** Content creator account with publishing and analytics capabilities. */
  CREATOR: 'creator',
});

/**
 * Enumeration of recipe publication status values.
 * Maps to dim_recipe.status CHECK constraint.
 * Only 'published' recipes are eligible to appear in the feed.
 *
 * @readonly
 * @enum {string}
 */
export const RECIPE_STATUS = Object.freeze({
  /** Recipe is being authored — not visible to other users. */
  DRAFT: 'draft',

  /** Recipe is live and eligible for feed distribution. */
  PUBLISHED: 'published',

  /** Recipe has been retired from the feed but remains accessible via direct link. */
  ARCHIVED: 'archived',

  /** Recipe has been flagged for content review — temporarily removed from feed. */
  FLAGGED: 'flagged',
});

/**
 * Enumeration of recipe card format types used in the feed.
 * Maps to fact_feed_impressions.card_format CHECK constraint.
 *
 * @readonly
 * @enum {string}
 */
export const CARD_FORMATS = Object.freeze({
  /** Standard recipe card with thumbnail, title, and metadata strip. */
  STANDARD: 'standard',

  /** Larger featured card occupying more vertical feed real estate. */
  FEATURED: 'featured',

  /** Card with auto-playing muted video loop instead of static thumbnail. */
  VIDEO_AUTOPLAY: 'video_autoplay',

  /** Paid placement card — visually differentiated with a 'Sponsored' badge. */
  SPONSORED: 'sponsored',

  /** Special card format highlighting a creator's profile alongside their recipe. */
  CREATOR_SPOTLIGHT: 'creator_spotlight',
});

// =============================================================================
// SECTION 2 — DIMENSION TABLE ENTITY TYPES (JSDoc @typedef)
// =============================================================================

/**
 * @typedef {object} DimUser
 * @description
 * Represents one version (SCD2 row) of a CulinaryFeed user profile.
 * Mirrors the dim_user warehouse table. In the client layer, the `current` user
 * object always has `isCurrent: true` and `validTo: null`.
 *
 * @property {string} userSk
 *   Surrogate key (UUID v4). Unique per SCD2 version row.
 *   Maps to: dim_user.user_sk
 *
 * @property {string} userId
 *   Stable natural business key (UUID v4). Constant across all SCD2 versions.
 *   Maps to: dim_user.user_id
 *
 * @property {string|null} displayName
 *   User-chosen display handle. Null for fully anonymous sessions.
 *   Maps to: dim_user.display_name
 *
 * @property {string|null} emailHash
 *   SHA-256 of normalised lowercase email. Null for anonymous users.
 *   Maps to: dim_user.email_hash
 *
 * @property {'anonymous'|'registered'|'premium'|'creator'} accountType
 *   Account tier — determines feature access and feed personalisation depth.
 *   Maps to: dim_user.account_type
 *
 * @property {string[]|null} preferredCuisines
 *   Ordered array of cuisine_id slugs from dim_cuisine.
 *   Maps to: dim_user.preferred_cuisines
 *
 * @property {string[]|null} dietaryFlags
 *   Array of dietary restriction strings, e.g. ['vegan', 'gluten-free'].
 *   Maps to: dim_user.dietary_flags
 *
 * @property {'beginner'|'intermediate'|'advanced'|'professional'|null} skillLevel
 *   Self-declared cooking skill. Null until the onboarding survey is completed.
 *   Maps to: dim_user.skill_level
 *
 * @property {string|null} regionCode
 *   ISO 3166-1 alpha-2 country/region code, e.g. 'US', 'IN', 'GB'.
 *   Maps to: dim_user.region_code
 *
 * @property {string|null} locale
 *   BCP 47 language-region tag, e.g. 'en-US', 'fr-FR'.
 *   Maps to: dim_user.locale
 *
 * @property {string|null} timezone
 *   IANA timezone string, e.g. 'America/New_York'.
 *   Maps to: dim_user.timezone
 *
 * @property {string|null} avatarUrl
 *   CDN URL for the profile image. Null if not set.
 *   Maps to: dim_user.avatar_url
 *
 * @property {string} createdAt
 *   ISO-8601 UTC timestamp of original account/session creation.
 *   Maps to: dim_user.created_at
 *
 * @property {string} validFrom
 *   ISO-8601 UTC timestamp when this SCD2 version became active.
 *   Maps to: dim_user.valid_from
 *
 * @property {string|null} validTo
 *   ISO-8601 UTC timestamp when superseded. Null = current record.
 *   Maps to: dim_user.valid_to
 *
 * @property {boolean} isCurrent
 *   Denormalised flag — true for the latest version of a user record.
 *   Maps to: dim_user.is_current
 */

/**
 * @typedef {object} DimCuisine
 * @description
 * Reference entity for a cuisine taxonomy entry. Low-cardinality (~150 rows).
 * Mirrors the dim_cuisine warehouse table.
 *
 * @property {string} cuisineId
 *   Slug-style natural key, e.g. 'italian', 'japanese-ramen', 'south-indian'.
 *   Maps to: dim_cuisine.cuisine_id
 *
 * @property {string} cuisineName
 *   Display name, e.g. 'Italian', 'Japanese Ramen'.
 *   Maps to: dim_cuisine.cuisine_name
 *
 * @property {string|null} parentCuisineId
 *   Self-referential FK enabling a two-level hierarchy.
 *   Maps to: dim_cuisine.parent_cuisine_id
 *
 * @property {string|null} region
 *   Broad geographic region, e.g. 'East Asia', 'Mediterranean'.
 *   Maps to: dim_cuisine.region
 *
 * @property {string|null} description
 *   Editorial short description for UI tooltips and SEO.
 *   Maps to: dim_cuisine.description
 *
 * @property {string|null} iconUrl
 *   CDN URL for the cuisine category icon/flag.
 *   Maps to: dim_cuisine.icon_url
 *
 * @property {boolean} isActive
 *   False if this cuisine tag has been soft-deleted/retired.
 *   Maps to: dim_cuisine.is_active
 *
 * @property {number|null} sortOrder
 *   Manual editorial sort position for onboarding preference pickers.
 *   Maps to: dim_cuisine.sort_order
 *
 * @property {string} createdAt
 *   ISO-8601 UTC timestamp of record insertion.
 *   Maps to: dim_cuisine.created_at
 */

/**
 * @typedef {object} DimRecipe
 * @description
 * Represents one version (SCD2 row) of a CulinaryFeed recipe.
 * Mirrors the dim_recipe warehouse table. Only `status: 'published'` recipes
 * are distributed via the feed.
 *
 * @property {string} recipeSk
 *   Surrogate key (UUID v4) for this specific recipe version.
 *   Maps to: dim_recipe.recipe_sk
 *
 * @property {string} recipeId
 *   Stable business key (UUID v4) assigned at first publish.
 *   Maps to: dim_recipe.recipe_id
 *
 * @property {string} title
 *   Recipe display title, e.g. 'Spicy Miso Ramen with Soft-Boiled Egg'.
 *   Maps to: dim_recipe.title
 *
 * @property {string} slug
 *   URL-safe slug, e.g. 'spicy-miso-ramen-soft-boiled-egg'.
 *   Maps to: dim_recipe.slug
 *
 * @property {string} creatorUserId
 *   Stable user_id of the recipe's author/creator.
 *   Maps to: dim_recipe.creator_user_id
 *
 * @property {string} cuisineId
 *   Primary cuisine classification (FK to dim_cuisine.cuisine_id).
 *   Maps to: dim_recipe.cuisine_id
 *
 * @property {string[]|null} secondaryCuisineIds
 *   Additional cuisine_id strings for fusion/multi-cuisine recipes.
 *   Maps to: dim_recipe.secondary_cuisine_ids
 *
 * @property {'easy'|'medium'|'hard'|'expert'} difficultyTier
 *   Difficulty classification — matches DIFFICULTY_TIERS constant.
 *   Maps to: dim_recipe.difficulty_tier
 *
 * @property {number} prepTimeMinutes
 *   Active preparation time in minutes.
 *   Maps to: dim_recipe.prep_time_minutes
 *
 * @property {number} cookTimeMinutes
 *   Active cooking time in minutes.
 *   Maps to: dim_recipe.cook_time_minutes
 *
 * @property {number} totalTimeMinutes
 *   prepTimeMinutes + cookTimeMinutes. Denormalised computed field.
 *   Maps to: dim_recipe.total_time_minutes
 *
 * @property {number|null} servings
 *   Number of servings the recipe yields as authored.
 *   Maps to: dim_recipe.servings
 *
 * @property {string[]|null} dietaryTags
 *   Dietary classification strings, e.g. ['vegan', 'nut-free'].
 *   Maps to: dim_recipe.dietary_tags
 *
 * @property {number|null} calorieEstimate
 *   Approximate calories per serving. Null if not provided.
 *   Maps to: dim_recipe.calorie_estimate
 *
 * @property {string|null} thumbnailUrl
 *   CDN URL for the recipe card thumbnail image.
 *   Maps to: dim_recipe.thumbnail_url
 *
 * @property {string|null} heroVideoUrl
 *   CDN URL for the short-form recipe video (≤60s). Null if no video.
 *   Maps to: dim_recipe.hero_video_url
 *
 * @property {number|null} averageRating
 *   Denormalised rolling average star rating (0.00–5.00).
 *   Maps to: dim_recipe.average_rating
 *
 * @property {number|null} ratingCount
 *   Total number of ratings contributing to averageRating.
 *   Maps to: dim_recipe.rating_count
 *
 * @property {number} saveCount
 *   Denormalised running total of user saves.
 *   Maps to: dim_recipe.save_count
 *
 * @property {number} cookCount
 *   Denormalised running total of "I Made This" submissions.
 *   Maps to: dim_recipe.cook_count
 *
 * @property {'draft'|'published'|'archived'|'flagged'} status
 *   Publication state — only 'published' recipes appear in the feed.
 *   Maps to: dim_recipe.status
 *
 * @property {string|null} publishedAt
 *   ISO-8601 UTC timestamp of first publication. Null for drafts.
 *   Maps to: dim_recipe.published_at
 *
 * @property {string} validFrom
 *   ISO-8601 UTC timestamp when this SCD2 version became canonical.
 *   Maps to: dim_recipe.valid_from
 *
 * @property {string|null} validTo
 *   ISO-8601 UTC timestamp when this version was superseded. Null = current.
 *   Maps to: dim_recipe.valid_to
 */

/**
 * @typedef {object} NutritionPer100g
 * @description Macro/micronutrient values per 100g of an ingredient.
 *
 * @property {number|null} calories   Calories (kcal) per 100g.
 * @property {number|null} fat        Fat in grams per 100g.
 * @property {number|null} carbs      Carbohydrates in grams per 100g.
 * @property {number|null} protein    Protein in grams per 100g.
 * @property {number|null} fibre      Dietary fibre in grams per 100g.
 * @property {number|null} sodium     Sodium in milligrams per 100g.
 * @property {number|null} sugar      Total sugar in grams per 100g.
 */

/**
 * @typedef {object} DimIngredient
 * @description
 * Canonical ingredient entity. Mirrors the dim_ingredient warehouse table.
 * Ingredients are normalised — aliases all resolve to one canonical entry.
 *
 * @property {string} ingredientId
 *   Slug-style canonical PK, e.g. 'olive-oil', 'garlic-clove', 'miso-paste'.
 *   Maps to: dim_ingredient.ingredient_id
 *
 * @property {string} canonicalName
 *   Normalised display name, e.g. 'Olive Oil', 'Garlic Clove'.
 *   Maps to: dim_ingredient.canonical_name
 *
 * @property {string[]|null} aliases
 *   Alternate name strings that resolve to this ingredient.
 *   Maps to: dim_ingredient.aliases
 *
 * @property {'produce'|'protein'|'dairy'|'pantry'|'spice'|'condiment'|'grain'|'beverage'|'other'} category
 *   High-level ingredient category — matches INGREDIENT_CATEGORIES constant.
 *   Maps to: dim_ingredient.category
 *
 * @property {string|null} subCategory
 *   Fine-grained sub-grouping, e.g. 'leafy greens', 'aged cheese'.
 *   Maps to: dim_ingredient.sub_category
 *
 * @property {string|null} unitOfMeasure
 *   Primary canonical unit, e.g. 'g', 'ml', 'clove', 'tbsp'.
 *   Maps to: dim_ingredient.unit_of_measure
 *
 * @property {boolean} commonAllergen
 *   True if this ingredient is one of the top-14 EU / top-9 US allergens.
 *   Maps to: dim_ingredient.common_allergen
 *
 * @property {string[]|null} allergenTypes
 *   Specific allergen classifications, e.g. ['gluten', 'tree-nuts'].
 *   Maps to: dim_ingredient.allergen_types
 *
 * @property {NutritionPer100g|null} nutritionPer100g
 *   Macro/micronutrient map per 100g. Null if not yet populated.
 *   Maps to: dim_ingredient.nutrition_per_100g
 *
 * @property {number[]|null} seasonAvailability
 *   Array of month numbers (1–12) for peak seasonal availability.
 *   Maps to: dim_ingredient.season_availability
 *
 * @property {boolean} isActive
 *   False if the ingredient has been deprecated or merged.
 *   Maps to: dim_ingredient.is_active
 *
 * @property {string} createdAt
 *   ISO-8601 UTC timestamp of record insertion.
 *   Maps to: dim_ingredient.created_at
 */

/**
 * @typedef {object} BridgeRecipeIngredient
 * @description
 * Many-to-many junction between one recipe version and one canonical ingredient.
 * Mirrors the bridge_recipe_ingredient warehouse table.
 *
 * @property {string} bridgeId
 *   Surrogate key (UUID v4) for this bridge row.
 *   Maps to: bridge_recipe_ingredient.bridge_id
 *
 * @property {string} recipeSk
 *   SCD2 recipe surrogate key — links to dim_recipe.recipe_sk.
 *   Maps to: bridge_recipe_ingredient.recipe_sk
 *
 * @property {string} ingredientId
 *   Canonical ingredient identifier — links to dim_ingredient.ingredient_id.
 *   Maps to: bridge_recipe_ingredient.ingredient_id
 *
 * @property {number|null} quantity
 *   Numeric amount. Null for 'to taste' entries.
 *   Maps to: bridge_recipe_ingredient.quantity
 *
 * @property {string|null} unit
 *   Unit for the quantity, e.g. 'g', 'cups', 'cloves'.
 *   Maps to: bridge_recipe_ingredient.unit
 *
 * @property {string|null} preparationNote
 *   Preparation qualifier, e.g. 'finely diced', 'toasted'.
 *   Maps to: bridge_recipe_ingredient.preparation_note
 *
 * @property {boolean} isOptional
 *   True if the ingredient is listed as optional/garnish.
 *   Maps to: bridge_recipe_ingredient.is_optional
 *
 * @property {number} displayOrder
 *   1-based position in the recipe's ingredient list.
 *   Maps to: bridge_recipe_ingredient.display_order
 *
 * @property {string|null} sectionLabel
 *   Group label for multi-section recipes, e.g. 'For the marinade'.
 *   Maps to: bridge_recipe_ingredient.section_label
 */

// =============================================================================
// SECTION 3 — FACT TABLE ENTITY TYPES (JSDoc @typedef)
// =============================================================================

/**
 * @typedef {object} FactFeedSession
 * @description
 * Represents one discrete user feed session. Mirrors fact_feed_sessions.
 * Sessions are initialised client-side on feed mount and closed on unmount,
 * inactivity timeout, or navigation away.
 *
 * @property {string} sessionId
 *   Client-generated UUID v4, assigned at session start (feed mount).
 *   Maps to: fact_feed_sessions.session_id
 *
 * @property {string} userSk
 *   SCD2-accurate dim_user surrogate key at session start time.
 *   Maps to: fact_feed_sessions.user_sk
 *
 * @property {string} userId
 *   Denormalised stable user business key.
 *   Maps to: fact_feed_sessions.user_id
 *
 * @property {string} sessionStartTs
 *   ISO-8601 UTC timestamp of session initialisation.
 *   Maps to: fact_feed_sessions.session_start_ts
 *
 * @property {string|null} sessionEndTs
 *   ISO-8601 UTC timestamp of session termination. Null if abnormal end.
 *   Maps to: fact_feed_sessions.session_end_ts
 *
 * @property {number|null} sessionDurationMs
 *   Total session duration in milliseconds. Null if sessionEndTs is null.
 *   Maps to: fact_feed_sessions.session_duration_ms
 *
 * @property {'mobile'|'tablet'|'desktop'} deviceType
 *   Device form-factor inferred from User-Agent.
 *   Maps to: fact_feed_sessions.device_type
 *
 * @property {string|null} os
 *   Operating system name, e.g. 'iOS', 'Android', 'macOS'.
 *   Maps to: fact_feed_sessions.os
 *
 * @property {string|null} browser
 *   Browser family name, e.g. 'Chrome', 'Safari'.
 *   Maps to: fact_feed_sessions.browser
 *
 * @property {string|null} appVersion
 *   Semantic version of the CulinaryFeed client, e.g. '1.4.2'.
 *   Maps to: fact_feed_sessions.app_version
 *
 * @property {'wifi'|'5g'|'4g'|'3g'|'2g'|'offline'|'unknown'|null} networkType
 *   Network connection type from the Network Information API.
 *   Maps to: fact_feed_sessions.network_type
 *
 * @property {string} feedAlgorithmVersion
 *   Version identifier of the recommendation algorithm for this session.
 *   Maps to: fact_feed_sessions.feed_algorithm_version
 *
 * @property {number} totalImpressions
 *   Denormalised count of recipe cards shown. Updated at session close.
 *   Maps to: fact_feed_sessions.total_impressions
 *
 * @property {number} totalActions
 *   Denormalised count of meaningful user actions. Updated at session close.
 *   Maps to: fact_feed_sessions.total_actions
 *
 * @property {number|null} scrollDepthPct
 *   Percentage of the feed scrolled (0.00–100.00). Null if not tracked.
 *   Maps to: fact_feed_sessions.scroll_depth_pct
 *
 * @property {'home_tab'|'search'|'push_notification'|'deep_link'|'share_link'|'onboarding'|null} entryPoint
 *   The source that initiated this session.
 *   Maps to: fact_feed_sessions.entry_point
 *
 * @property {'manual_close'|'inactivity_timeout'|'navigation'|'app_background'|'crash'|'unknown'|null} exitReason
 *   The reason the session ended.
 *   Maps to: fact_feed_sessions.exit_reason
 */

/**
 * @typedef {object} FactFeedImpression
 * @description
 * Represents one recipe card impression event. An impression is recorded when
 * ≥50% of the card is in the viewport for ≥500ms (IAB viewability standard).
 * Mirrors fact_feed_impressions. Highest-volume fact record.
 *
 * @property {string} impressionId
 *   Client-generated UUID v4 for this impression event.
 *   Maps to: fact_feed_impressions.impression_id
 *
 * @property {string} sessionId
 *   Parent session UUID (FK to fact_feed_sessions.session_id).
 *   Maps to: fact_feed_impressions.session_id
 *
 * @property {string} userId
 *   Denormalised user natural key.
 *   Maps to: fact_feed_impressions.user_id
 *
 * @property {string} recipeSk
 *   SCD2-accurate recipe surrogate key at impression time.
 *   Maps to: fact_feed_impressions.recipe_sk
 *
 * @property {string} recipeId
 *   Denormalised stable recipe business key.
 *   Maps to: fact_feed_impressions.recipe_id
 *
 * @property {string} impressionTs
 *   ISO-8601 UTC timestamp when viewability threshold was first met.
 *   Maps to: fact_feed_impressions.impression_ts
 *
 * @property {number} feedPosition
 *   1-based position of the card in the feed at impression time.
 *   Maps to: fact_feed_impressions.feed_position
 *
 * @property {'standard'|'featured'|'video_autoplay'|'sponsored'|'creator_spotlight'} cardFormat
 *   Recipe card format variant.
 *   Maps to: fact_feed_impressions.card_format
 *
 * @property {number} visibleDurationMs
 *   Total milliseconds the card was in the viewable area (minimum 500ms).
 *   Maps to: fact_feed_impressions.visible_duration_ms
 *
 * @property {boolean} isAboveFold
 *   True if the card was visible without scrolling on initial load.
 *   Maps to: fact_feed_impressions.is_above_fold
 *
 * @property {boolean} wasClicked
 *   True if any click/tap action was registered on this impression.
 *   Maps to: fact_feed_impressions.was_clicked
 *
 * @property {number} heartbeatCount
 *   Number of IMPRESSION_HEARTBEAT events received for this impression.
 *   Maps to: fact_feed_impressions.heartbeat_count
 *
 * @property {number|null} scrollVelocityPxS
 *   Estimated scroll velocity (px/s) when the card entered the viewport.
 *   Maps to: fact_feed_impressions.scroll_velocity_px_s
 *
 * @property {string|null} experimentArm
 *   A/B experiment arm identifier. Null if not in an experiment.
 *   Maps to: fact_feed_impressions.experiment_arm
 */

/**
 * @typedef {object} FactUserAction
 * @description
 * Represents one discrete user interaction event. Covers the full funnel from
 * card-level saves to ingredient-level substitution requests.
 * Mirrors fact_user_actions.
 *
 * @property {string} actionId
 *   Client-generated UUID v4 for this action event.
 *   Maps to: fact_user_actions.action_id
 *
 * @property {string} sessionId
 *   Parent session UUID (FK to fact_feed_sessions.session_id).
 *   Maps to: fact_user_actions.session_id
 *
 * @property {string|null} impressionId
 *   Preceding impression UUID. Null for non-feed-card actions.
 *   Maps to: fact_user_actions.impression_id
 *
 * @property {string} userId
 *   Stable user natural key of the actor.
 *   Maps to: fact_user_actions.user_id
 *
 * @property {string} recipeId
 *   Stable recipe business key on which the action was performed.
 *   Maps to: fact_user_actions.recipe_id
 *
 * @property {string|null} ingredientId
 *   Canonical ingredient ID for ingredient-level interactions. Null otherwise.
 *   Maps to: fact_user_actions.ingredient_id
 *
 * @property {string} actionTs
 *   ISO-8601 UTC timestamp when the action event was dispatched.
 *   Maps to: fact_user_actions.action_ts
 *
 * @property {string} actionType
 *   Discriminator — one of the ACTION_TYPES constant values.
 *   Maps to: fact_user_actions.action_type
 *
 * @property {object|null} actionValue
 *   Action-specific payload. Shape varies by actionType.
 *   See event_contracts.json for per-type shape definitions.
 *   Maps to: fact_user_actions.action_value
 *
 * @property {string} clientTs
 *   ISO-8601 UTC device-local timestamp for clock-skew detection.
 *   Maps to: fact_user_actions.client_ts
 *
 * @property {number|null} latencyMs
 *   Server-assigned processing latency. Null until server processes the event.
 *   Maps to: fact_user_actions.latency_ms
 *
 * @property {'feed_card'|'recipe_detail'|'ingredient_panel'|'search_results'|null} uiContext
 *   UI surface from which the action was triggered.
 *   Maps to: fact_user_actions.ui_context
 *
 * @property {number|null} sequenceInSession
 *   1-based ordinal position of this action within the session's action sequence.
 *   Maps to: fact_user_actions.sequence_in_session
 */

// =============================================================================
// SECTION 4 — TELEMETRY EVENT ENVELOPE & PAYLOAD TYPES (JSDoc @typedef)
// =============================================================================

/**
 * @typedef {object} PlatformContext
 * @description
 * Client environment context captured at session start and cached for all
 * subsequent events within the same session. Populated from browser APIs.
 *
 * @property {'mobile'|'tablet'|'desktop'} deviceType  Device form-factor.
 * @property {string} os                               OS name (e.g. 'iOS', 'Android').
 * @property {string} browser                          Browser family (e.g. 'Safari', 'Chrome').
 * @property {'wifi'|'5g'|'4g'|'3g'|'2g'|'offline'|'unknown'} [networkType]
 *   Network type from Network Information API. Omitted if API unavailable.
 * @property {number} [viewportWidthPx]   window.innerWidth at event time.
 * @property {number} [viewportHeightPx]  window.innerHeight at event time.
 */

/**
 * @typedef {object} EventEnvelope
 * @description
 * Common wrapper emitted for every telemetry event. The `payload` property
 * contains the event-type-specific data.
 * Corresponds to the commonEnvelope definition in docs/event_contracts.json.
 *
 * @property {string}          eventId         Client UUID v4. Used for deduplication.
 * @property {string}          eventType       Discriminator — one of EVENT_TYPES values.
 * @property {string}          schemaVersion   Semver, e.g. '1.0.0'.
 * @property {string}          sessionId       Parent session UUID.
 * @property {string}          userId          Stable user business key.
 * @property {string}          clientTs        ISO-8601 UTC string at emission time.
 * @property {string}          appVersion      Client app semver, e.g. '1.4.2'.
 * @property {PlatformContext} platform        Client environment context.
 * @property {object}          payload         Event-type-specific payload object.
 */

/**
 * @typedef {object} ImpressionHeartbeatPayload
 * @description
 * Payload for EVENT_TYPES.IMPRESSION_HEARTBEAT events.
 * Corresponds to IMPRESSION_HEARTBEAT.payload in docs/event_contracts.json.
 *
 * @property {string}  impressionId              UUID of the parent impression.
 * @property {string}  recipeId                  Stable recipe business key.
 * @property {string}  recipeSk                  SCD2 recipe surrogate key.
 * @property {number}  feedPosition              1-based card position at impression time.
 * @property {number}  heartbeatSequence         Monotonically increasing counter (starts at 1).
 * @property {number}  cumulativeVisibleMs       Total ms the card has been ≥50% visible.
 * @property {number}  [currentVisibilityPct]    Card area currently in viewport (0–100).
 * @property {string}  cardFormat                Card format variant.
 * @property {boolean} isAboveFold               Whether card was initially above fold.
 * @property {number}  [scrollDepthAtHeartbeatPct] Percentage of feed scrolled at heartbeat time.
 * @property {number|null} [videoPlayPct]        Video play percentage for video_autoplay cards.
 * @property {string}  [experimentArm]           A/B experiment arm. Omitted if not in experiment.
 */

/**
 * @typedef {object} RecipeExpandPayload
 * @description
 * Payload for EVENT_TYPES.RECIPE_EXPAND events.
 * Corresponds to RECIPE_EXPAND.payload in docs/event_contracts.json.
 *
 * @property {string}  impressionId                  UUID of the triggering impression.
 * @property {string}  recipeId                      Stable recipe business key.
 * @property {string}  recipeSk                      SCD2 recipe surrogate key.
 * @property {'card_tap'|'card_swipe_up'|'title_tap'|'thumbnail_tap'|'cta_button'} expandTrigger
 *   The specific UI element or gesture that initiated the expand.
 * @property {number}  feedPosition                  1-based card position.
 * @property {number}  timeToExpandMs                Ms from impression viewability to expand.
 * @property {number}  [heartbeatsBeforeExpand]      Heartbeat count preceding expand.
 * @property {string}  cardFormat                    Card format variant.
 * @property {boolean} [isSaveStateVisible]          Whether save icon was visible on the card.
 * @property {number}  [scrollVelocityAtExpandPxS]   Scroll velocity (px/s) before expand.
 * @property {string|null} [previousRecipeId]        Last expanded recipe_id in this session.
 * @property {'overview'|'ingredients'|'steps'|'reviews'|'nutrition'} [detailSectionShown]
 *   First section shown in recipe detail on expand.
 * @property {string}  [experimentArm]               A/B experiment arm.
 */

/**
 * @typedef {object} IngredientInteractionPayload
 * @description
 * Payload for EVENT_TYPES.INGREDIENT_INTERACTION events.
 * Corresponds to INGREDIENT_INTERACTION.payload in docs/event_contracts.json.
 *
 * @property {string}  recipeId                      Stable recipe business key.
 * @property {string}  recipeSk                      SCD2 recipe surrogate key.
 * @property {string}  ingredientId                  Canonical ingredient PK slug.
 * @property {'tap_detail'|'request_substitution'|'add_to_pantry_list'|'mark_as_owned'|'mark_as_not_owned'|'long_press_preview'} interactionType
 *   Specific interaction performed.
 * @property {number}  ingredientPositionInList       1-based position in the ingredient list.
 * @property {'produce'|'protein'|'dairy'|'pantry'|'spice'|'condiment'|'grain'|'beverage'|'other'} ingredientCategory
 *   Ingredient category — denormalised from dim_ingredient for real-time pipelines.
 * @property {string|null} [ingredientSectionLabel]  Section label within the ingredient list.
 * @property {boolean} [isOptionalIngredient]        Whether the ingredient is optional.
 * @property {boolean} [isCommonAllergen]            Whether the ingredient is a common allergen.
 * @property {string|null} [substitutionRequestedFor] ingredient_id for substitute requests.
 * @property {'recipe_detail'|'ingredient_panel'|'quick_preview_sheet'} uiContext
 *   UI surface from which the interaction was triggered.
 * @property {number}  [timeSinceRecipeExpandMs]     Ms elapsed since the parent RECIPE_EXPAND event.
 * @property {string|null} [impressionId]            Parent feed impression UUID. Null for direct links.
 * @property {number}  [scrollPositionInDetailPct]   Scroll position in recipe detail view (0–100).
 */

// =============================================================================
// SECTION 5 — FACTORY / HELPER FUNCTIONS
// =============================================================================

/**
 * Generates a UUID v4 string using the Web Crypto API (crypto.randomUUID).
 * Falls back to a deterministic pseudo-random implementation if the API is
 * unavailable (e.g. in non-secure (HTTP) contexts during local development).
 *
 * @returns {string} A UUID v4 string, e.g. 'f47ac10b-58cc-4372-a567-0e02b2c3d479'.
 *
 * @example
 * const id = generateUUID();
 * console.log(id); // 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
 */
export function generateUUID() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  // Fallback: RFC 4122-compliant v4 UUID using Math.random()
  // NOTE: Not cryptographically secure — only used in development HTTP contexts.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the current UTC timestamp as an ISO-8601 string.
 * Consistently used across all event envelope `clientTs` fields.
 *
 * @returns {string} ISO-8601 UTC timestamp, e.g. '2026-08-25T08:15:30.450Z'.
 *
 * @example
 * const ts = nowISO();
 * // '2026-08-25T08:15:30.450Z'
 */
export function nowISO() {
  return new Date().toISOString();
}

/**
 * Constructs a fully-populated common event envelope.
 * Callers provide a type-specific payload; the envelope handles all
 * common fields automatically, ensuring consistency across all event types.
 *
 * @param {object}          options
 * @param {string}          options.eventType         One of EVENT_TYPES values.
 * @param {string}          options.sessionId         Current session UUID.
 * @param {string}          options.userId            Current user's stable business key.
 * @param {string}          options.appVersion        Client app semver.
 * @param {PlatformContext} options.platform          Platform context captured at session start.
 * @param {object}          options.payload           Event-type-specific payload object.
 * @param {string}          [options.schemaVersion]   Event contract version. Defaults to '1.0.0'.
 *
 * @returns {EventEnvelope} A complete event envelope ready for dispatch to the ingestion pipeline.
 *
 * @example
 * const envelope = buildEventEnvelope({
 *   eventType: EVENT_TYPES.RECIPE_EXPAND,
 *   sessionId: 'abc-123',
 *   userId: 'user-456',
 *   appVersion: '1.4.2',
 *   platform: { deviceType: 'mobile', os: 'iOS', browser: 'Safari' },
 *   payload: { impressionId: 'imp-789', recipeId: 'rec-000', ... },
 * });
 */
export function buildEventEnvelope({
  eventType,
  sessionId,
  userId,
  appVersion,
  platform,
  payload,
  schemaVersion = '1.0.0',
}) {
  return {
    eventId: generateUUID(),
    eventType,
    schemaVersion,
    sessionId,
    userId,
    clientTs: nowISO(),
    appVersion,
    platform,
    payload,
  };
}

/**
 * Constructs a minimal IMPRESSION_HEARTBEAT payload.
 * Callers must supply all required fields; optional fields can be spread in.
 *
 * @param {object}  required
 * @param {string}  required.impressionId        UUID of the parent impression.
 * @param {string}  required.recipeId            Stable recipe business key.
 * @param {string}  required.recipeSk            SCD2 recipe surrogate key.
 * @param {number}  required.feedPosition        1-based card position.
 * @param {number}  required.heartbeatSequence   Current heartbeat counter (≥1).
 * @param {number}  required.cumulativeVisibleMs Total ms visible so far.
 * @param {string}  required.cardFormat          Card format variant.
 * @param {boolean} required.isAboveFold         Whether card was initially above fold.
 * @param {object}  [optional]                   Optional fields spread into the payload.
 *
 * @returns {ImpressionHeartbeatPayload}
 */
export function buildImpressionHeartbeatPayload(required, optional = {}) {
  return {
    impressionId: required.impressionId,
    recipeId: required.recipeId,
    recipeSk: required.recipeSk,
    feedPosition: required.feedPosition,
    heartbeatSequence: required.heartbeatSequence,
    cumulativeVisibleMs: required.cumulativeVisibleMs,
    cardFormat: required.cardFormat,
    isAboveFold: required.isAboveFold,
    ...optional,
  };
}

/**
 * Constructs a minimal RECIPE_EXPAND payload.
 *
 * @param {object}  required
 * @param {string}  required.impressionId    UUID of the triggering impression.
 * @param {string}  required.recipeId        Stable recipe business key.
 * @param {string}  required.recipeSk        SCD2 recipe surrogate key.
 * @param {string}  required.expandTrigger   The UI gesture that triggered the expand.
 * @param {number}  required.feedPosition    1-based card position.
 * @param {number}  required.timeToExpandMs  Ms from impression to expand.
 * @param {string}  required.cardFormat      Card format variant.
 * @param {object}  [optional]              Optional fields spread into the payload.
 *
 * @returns {RecipeExpandPayload}
 */
export function buildRecipeExpandPayload(required, optional = {}) {
  return {
    impressionId: required.impressionId,
    recipeId: required.recipeId,
    recipeSk: required.recipeSk,
    expandTrigger: required.expandTrigger,
    feedPosition: required.feedPosition,
    timeToExpandMs: required.timeToExpandMs,
    cardFormat: required.cardFormat,
    ...optional,
  };
}

/**
 * Constructs a minimal INGREDIENT_INTERACTION payload.
 *
 * @param {object}  required
 * @param {string}  required.recipeId                  Stable recipe business key.
 * @param {string}  required.recipeSk                  SCD2 recipe surrogate key.
 * @param {string}  required.ingredientId              Canonical ingredient PK slug.
 * @param {string}  required.interactionType           Interaction sub-type.
 * @param {number}  required.ingredientPositionInList  1-based position in ingredient list.
 * @param {string}  required.ingredientCategory        Ingredient category.
 * @param {string}  required.uiContext                 UI surface of interaction.
 * @param {object}  [optional]                         Optional fields spread into the payload.
 *
 * @returns {IngredientInteractionPayload}
 */
export function buildIngredientInteractionPayload(required, optional = {}) {
  return {
    recipeId: required.recipeId,
    recipeSk: required.recipeSk,
    ingredientId: required.ingredientId,
    interactionType: required.interactionType,
    ingredientPositionInList: required.ingredientPositionInList,
    ingredientCategory: required.ingredientCategory,
    uiContext: required.uiContext,
    ...optional,
  };
}

// =============================================================================
// SECTION 6 — SCHEMA METADATA CONSTANTS
// =============================================================================

/**
 * Current schema version for event contracts.
 * Bump this when making breaking changes to any event payload schema.
 *
 * @type {string}
 * @constant
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * Current semantic version of the CulinaryFeed application.
 * Used in event envelopes. Update via CI/CD on each release.
 *
 * @type {string}
 * @constant
 */
export const APP_VERSION = '1.0.0';

/**
 * Minimum visible duration in milliseconds required for an event to qualify
 * as a viewable impression (IAB viewability standard: ≥50% visible for ≥500ms).
 *
 * @type {number}
 * @constant
 */
export const IMPRESSION_VIEWABILITY_THRESHOLD_MS = 500;

/**
 * Interval in milliseconds between consecutive IMPRESSION_HEARTBEAT events
 * for a single continuously-visible recipe card.
 *
 * @type {number}
 * @constant
 */
export const HEARTBEAT_INTERVAL_MS = 5000;

/**
 * Duration of user inactivity (in milliseconds) after which a feed session
 * is automatically terminated with exit_reason: 'inactivity_timeout'.
 *
 * @type {number}
 * @constant
 */
export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Minimum percentage of a recipe card's area that must be in the viewport
 * for it to qualify as viewable (IAB standard: 50%).
 *
 * @type {number}
 * @constant
 */
export const IMPRESSION_VISIBILITY_THRESHOLD_PCT = 50;

/**
 * Debounce window in milliseconds applied to rapid ingredient tap events.
 * Multiple taps within this window are collapsed to a single INGREDIENT_INTERACTION event.
 *
 * @type {number}
 * @constant
 */
export const INGREDIENT_TAP_DEBOUNCE_MS = 300;
