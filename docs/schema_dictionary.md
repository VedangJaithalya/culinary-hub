# CulinaryFeed — Entity-Relationship Data Dictionary

> **Phase 1 · Data Foundations** | Last Updated: 2026-08-25  
> Schema Version: `1.0.0`  
> Environment: React + Vite (ES6+ / JSX) · Client-side event layer → Backend analytics store

---

## Table of Contents

1. [Overview & Design Principles](#overview--design-principles)
2. [Dimension Tables](#dimension-tables)
   - [dim_user](#dim_user)
   - [dim_cuisine](#dim_cuisine)
   - [dim_recipe](#dim_recipe)
   - [dim_ingredient](#dim_ingredient)
   - [bridge_recipe_ingredient](#bridge_recipe_ingredient)
3. [Fact Tables](#fact-tables)
   - [fact_feed_sessions](#fact_feed_sessions)
   - [fact_feed_impressions](#fact_feed_impressions)
   - [fact_user_actions](#fact_user_actions)
4. [Entity Relationship Diagram](#entity-relationship-diagram)
5. [Constraint & Type Legend](#constraint--type-legend)

---

## Overview & Design Principles

CulinaryFeed uses a **Kimball-style star schema** oriented around a social cooking-content feed. The schema is designed for:

- **Funnel analysis** — Impression → Expand → Save → Cook
- **Personalization signals** — Per-user ingredient affinity and cuisine preference
- **Content performance** — Recipe-level engagement metrics rolled up from raw impression facts
- **Session-level cohort analysis** — Device, network, and time-of-day segmentation

All surrogate keys use **UUID v4** strings generated client-side and reconciled server-side. All timestamps are **ISO-8601 UTC** strings.

---

## Dimension Tables

---

### `dim_user`

**Business Definition:** One row per registered or anonymous user of the CulinaryFeed application. Slowly Changing Dimension Type 2 (SCD2) — historical profile changes are versioned via `valid_from` / `valid_to`.

| Column Name          | Data Type     | Constraints             | Nullable | Business Definition                                                                                   | Analytical Utility                                                          |
|----------------------|---------------|-------------------------|----------|-------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| `user_sk`            | UUID (string) | **PK**                  | NO       | Surrogate key — system-generated UUID for each SCD2 row.                                              | Join key for all fact tables.                                               |
| `user_id`            | UUID (string) | UNIQUE (per version)    | NO       | Stable natural business key issued at registration or anonymous session creation.                     | Collapse SCD2 history into current-user aggregates.                         |
| `display_name`       | VARCHAR(80)   | —                       | YES      | User-chosen display handle (may contain emoji). NULL for fully anonymous sessions.                    | Personalisation labels; exclude NULLs for social graph analysis.            |
| `email_hash`         | VARCHAR(64)   | —                       | YES      | SHA-256 of normalised lower-case email. NULL for anonymous users.                                     | Cross-device stitching; PII-safe join key with CRM systems.                 |
| `account_type`       | ENUM          | CHECK IN (...)          | NO       | One of: `anonymous`, `registered`, `premium`, `creator`.                                              | Feature-gating and monetisation cohort segmentation.                        |
| `preferred_cuisines` | JSON (array)  | —                       | YES      | Ordered array of `cuisine_id` strings — user's self-declared cuisine preferences.                    | Cold-start personalisation; onboarding affinity seed.                       |
| `dietary_flags`      | JSON (array)  | —                       | YES      | Array of dietary restriction strings, e.g. `["vegan","gluten-free"]`.                                | Negative-signal filtering; recipe exclusion logic.                          |
| `skill_level`        | ENUM          | CHECK IN (...)          | YES      | One of: `beginner`, `intermediate`, `advanced`, `professional`. NULL until survey completed.          | Difficulty-tier matching; recipe recommendation ranking feature.            |
| `region_code`        | VARCHAR(10)   | ISO 3166-1 alpha-2      | YES      | User's declared or geo-inferred country/region code, e.g. `US`, `IN`, `GB`.                          | Regional cuisine trending; GDPR/CCPA compliance segmentation.               |
| `locale`             | VARCHAR(10)   | BCP 47                  | YES      | Language-region tag, e.g. `en-US`, `fr-FR`. Drives i18n on the client.                               | Content localisation; translation coverage analysis.                        |
| `timezone`           | VARCHAR(50)   | IANA tz                 | YES      | IANA timezone string, e.g. `America/New_York`.                                                        | Meal-time session bucketing (breakfast / lunch / dinner feeds).             |
| `avatar_url`         | VARCHAR(512)  | —                       | YES      | CDN URL for the user profile image. NULL if not set.                                                  | UI rendering only.                                                          |
| `created_at`         | TIMESTAMP     | —                       | NO       | UTC timestamp of original account creation or first anonymous session.                                | Cohort age; D1/D7/D30 retention curves.                                     |
| `valid_from`         | TIMESTAMP     | —                       | NO       | UTC timestamp when this SCD2 row became active.                                                       | Point-in-time joins for historical accuracy.                                |
| `valid_to`           | TIMESTAMP     | —                       | YES      | UTC timestamp when this SCD2 row was superseded. NULL = current record.                               | Filter `WHERE valid_to IS NULL` for current-state joins.                    |
| `is_current`         | BOOLEAN       | —                       | NO       | Denormalised flag: TRUE if this is the latest version of the user record.                             | Performance optimisation — avoids timestamp comparison on large scans.      |

**Indexes:** `user_id`, `(is_current, account_type)`, `region_code`

---

### `dim_cuisine`

**Business Definition:** Reference dimension cataloguing all cuisine taxonomies (~150 rows). Used to categorise recipes and drive personalised feed ranking. Low-cardinality, stable.

| Column Name         | Data Type    | Constraints   | Nullable | Business Definition                                                                            | Analytical Utility                                                                   |
|---------------------|--------------|---------------|----------|------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| `cuisine_id`        | VARCHAR(40)  | **PK**        | NO       | Slug-style natural key, e.g. `italian`, `japanese-ramen`, `south-indian`.                     | Human-readable FK used across recipe and user preference columns.                    |
| `cuisine_name`      | VARCHAR(100) | UNIQUE        | NO       | Display name, e.g. `"Italian"`, `"Japanese Ramen"`.                                           | UI labels; grouping in trend dashboards.                                             |
| `parent_cuisine_id` | VARCHAR(40)  | FK → self     | YES      | Self-referential FK enabling a two-level hierarchy (e.g. `ramen` → `japanese`).               | Hierarchical roll-up: dish-level → regional → national cuisine aggregations.         |
| `region`            | VARCHAR(100) | —             | YES      | Broad geographic region, e.g. `"East Asia"`, `"Mediterranean"`, `"South Asia"`.               | Geographic feed theming; regional content bundles.                                   |
| `description`       | TEXT         | —             | YES      | Editorial short description for UI tooltips and SEO.                                           | Content enrichment; not used in analytical joins.                                    |
| `icon_url`          | VARCHAR(512) | —             | YES      | CDN URL for a cuisine category icon/flag.                                                      | UI rendering only.                                                                   |
| `is_active`         | BOOLEAN      | DEFAULT TRUE  | NO       | Whether this cuisine tag is actively surfaced in the feed. FALSE = soft-deleted/retired.       | Filter inactive tags from recommendation candidates.                                 |
| `sort_order`        | INTEGER      | —             | YES      | Manual editorial sort position for onboarding preference pickers.                              | UI ordering; exploration discovery ranking.                                          |
| `created_at`        | TIMESTAMP    | —             | NO       | UTC timestamp of record insertion.                                                             | Audit trail.                                                                         |

**Indexes:** `parent_cuisine_id`, `region`, `is_active`

---

### `dim_recipe`

**Business Definition:** Core content dimension — one row per published recipe version. Supports SCD1 (overwrites) for editorial corrections and SCD2 (versioned rows) for structural changes. `recipe_id` is the stable business key; `recipe_sk` is the surrogate.

| Column Name             | Data Type    | Constraints           | Nullable | Business Definition                                                                                    | Analytical Utility                                                                           |
|-------------------------|--------------|-----------------------|----------|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `recipe_sk`             | UUID (string)| **PK**                | NO       | Surrogate key for this specific recipe version.                                                        | Fact table join key (point-in-time accurate).                                                |
| `recipe_id`             | UUID (string)| UNIQUE (per version)  | NO       | Stable business key assigned at first publish. Consistent across versions.                             | Collapse SCD history; join with creator dashboards.                                          |
| `title`                 | VARCHAR(200) | —                     | NO       | Recipe display title, e.g. `"Spicy Miso Ramen with Soft-Boiled Egg"`.                                 | Full-text search indexing; A/B title testing analysis.                                       |
| `slug`                  | VARCHAR(220) | UNIQUE                | NO       | URL-safe slug, e.g. `spicy-miso-ramen-soft-boiled-egg`.                                               | Deep-link routing; SEO canonical URL construction.                                           |
| `creator_user_id`       | UUID (string)| FK → dim_user         | NO       | `user_id` of the recipe author/creator.                                                                | Creator performance dashboards; revenue attribution.                                         |
| `cuisine_id`            | VARCHAR(40)  | FK → dim_cuisine      | NO       | Primary cuisine classification.                                                                        | Cuisine-level engagement analysis; personalised feed ranking.                                |
| `secondary_cuisine_ids` | JSON (array) | —                     | YES      | Additional `cuisine_id` strings for fusion recipes.                                                    | Fusion cuisine analysis; secondary personalisation signal.                                   |
| `difficulty_tier`       | ENUM         | CHECK IN (...)        | NO       | One of: `easy`, `medium`, `hard`, `expert`. Matches `DIFFICULTY_TIERS` constant.                      | Skill-level matching; difficulty progression analysis.                                       |
| `prep_time_minutes`     | INTEGER      | CHECK >= 0            | NO       | Active preparation time in minutes (excludes passive cooking/marinating).                              | Time-to-cook segmentation; "quick meals" filter performance.                                 |
| `cook_time_minutes`     | INTEGER      | CHECK >= 0            | NO       | Active cooking time in minutes.                                                                        | Total time calculation: `prep_time + cook_time`.                                             |
| `total_time_minutes`    | INTEGER      | COMPUTED              | NO       | `prep_time_minutes + cook_time_minutes`. Denormalised for query performance.                           | Primary time-based filtering dimension.                                                      |
| `servings`              | INTEGER      | CHECK >= 1            | YES      | Number of servings the recipe yields as authored.                                                      | Per-serving nutrition normalisation.                                                         |
| `dietary_tags`          | JSON (array) | —                     | YES      | Dietary classification strings, e.g. `["vegan","nut-free"]`.                                          | Dietary filter match rate; personalisation negative-signal analysis.                         |
| `calorie_estimate`      | INTEGER      | CHECK >= 0            | YES      | Approximate calories per serving. NULL if not provided by creator.                                     | Nutritional feed personalisation; calorie-conscious cohort analysis.                         |
| `thumbnail_url`         | VARCHAR(512) | —                     | YES      | CDN URL for the recipe card thumbnail image.                                                           | LCP performance monitoring; image A/B test tracking.                                         |
| `hero_video_url`        | VARCHAR(512) | —                     | YES      | CDN URL for the short-form recipe video (≤60s). NULL if no video.                                     | Video vs. static card engagement comparison.                                                 |
| `average_rating`        | DECIMAL(3,2) | CHECK 0-5             | YES      | Denormalised rolling average star rating (0.00–5.00). Updated by ETL job.                             | Rating-weighted ranking; quality threshold filtering.                                        |
| `rating_count`          | INTEGER      | CHECK >= 0            | YES      | Total number of ratings contributing to `average_rating`.                                              | Rating confidence scoring (Bayesian smoothing for low-count recipes).                        |
| `save_count`            | INTEGER      | DEFAULT 0             | NO       | Denormalised running total of user saves. Updated by ETL.                                              | Virality / social proof signal; trending recipe identification.                              |
| `cook_count`            | INTEGER      | DEFAULT 0             | NO       | Denormalised running total of "I made this" submissions.                                               | True engagement depth metric; conversion rate denominator.                                   |
| `status`                | ENUM         | CHECK IN (...)        | NO       | One of: `draft`, `published`, `archived`, `flagged`. Only `published` rows appear in feed.            | Content moderation pipeline; feed eligibility filter.                                        |
| `published_at`          | TIMESTAMP    | —                     | YES      | UTC timestamp of first publication. NULL for drafts.                                                   | Freshness scoring; "New this week" feed bucket logic.                                        |
| `valid_from`            | TIMESTAMP    | —                     | NO       | UTC timestamp when this recipe version became canonical.                                                | Point-in-time SCD2 joins.                                                                    |
| `valid_to`              | TIMESTAMP    | —                     | YES      | UTC timestamp when this version was superseded. NULL = current.                                        | Current-version filter: `WHERE valid_to IS NULL`.                                            |

**Indexes:** `recipe_id`, `cuisine_id`, `difficulty_tier`, `status`, `(status, published_at)`

---

### `dim_ingredient`

**Business Definition:** Ingredient master reference — one row per canonical ingredient entity. Ingredients are normalised to a canonical form (e.g. "lemon juice" and "fresh lemon juice" both resolve to `lemon-juice`). Aliases stored in `aliases` field.

| Column Name          | Data Type    | Constraints        | Nullable | Business Definition                                                                                   | Analytical Utility                                                              |
|----------------------|--------------|--------------------|----------|-------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `ingredient_id`      | VARCHAR(60)  | **PK**             | NO       | Slug-style canonical identifier, e.g. `olive-oil`, `garlic-clove`, `miso-paste`.                     | FK from bridge table and event contracts.                                       |
| `canonical_name`     | VARCHAR(120) | UNIQUE             | NO       | Normalised display name, e.g. `"Olive Oil"`, `"Garlic Clove"`.                                       | Full-text search; ingredient trending dashboards.                               |
| `aliases`            | JSON (array) | —                  | YES      | Alternate name strings resolving to this ingredient, e.g. `["EVOO","extra virgin OO"]`.              | NLP entity resolution; creator input normalisation.                             |
| `category`           | ENUM         | CHECK IN (...)     | NO       | One of: `produce`, `protein`, `dairy`, `pantry`, `spice`, `condiment`, `grain`, `beverage`, `other`. Matches `INGREDIENT_CATEGORIES` constant. | Category-level interaction analysis; pantry tracking features. |
| `sub_category`       | VARCHAR(60)  | —                  | YES      | Fine-grained sub-grouping, e.g. `"leafy greens"`, `"red meat"`, `"aged cheese"`.                     | Granular affinity modelling; substitution suggestion logic.                     |
| `unit_of_measure`    | VARCHAR(30)  | —                  | YES      | Primary canonical unit (e.g. `"g"`, `"ml"`, `"clove"`, `"tbsp"`).                                   | Quantity normalisation for nutritional calculations.                            |
| `common_allergen`    | BOOLEAN      | DEFAULT FALSE      | NO       | TRUE if this ingredient is one of the top-14 EU allergens or top-9 US allergens.                     | Allergen warning UI triggers; dietary safety filtering.                         |
| `allergen_types`     | JSON (array) | —                  | YES      | Specific allergen classifications, e.g. `["gluten","tree-nuts"]`. NULL if not an allergen.           | Precise allergen exclusion logic in personalised feeds.                         |
| `nutrition_per_100g` | JSON (object)| —                  | YES      | Key-value map of macro/micronutrients per 100g, e.g. `{calories: 884, fat: 100, protein: 0}`.        | Per-serving nutrition estimation; calorie-tracking feature.                     |
| `season_availability`| JSON (array) | —                  | YES      | Array of month numbers (1–12) indicating typical peak seasonal availability.                          | Seasonal recipe surfacing; "In season now" feed feature.                        |
| `is_active`          | BOOLEAN      | DEFAULT TRUE       | NO       | FALSE if the ingredient has been deprecated or merged into another canonical entry.                   | Filter deprecated entries from suggestion dropdowns.                            |
| `created_at`         | TIMESTAMP    | —                  | NO       | UTC timestamp of record insertion.                                                                    | Audit trail.                                                                    |

**Indexes:** `category`, `common_allergen`, `is_active`

---

### `bridge_recipe_ingredient`

**Business Definition:** Many-to-many bridge between `dim_recipe` and `dim_ingredient`. One row per ingredient occurrence in a specific recipe version. Represents the structured ingredient list and enables ingredient-level analytics.

| Column Name        | Data Type    | Constraints                    | Nullable | Business Definition                                                                                          | Analytical Utility                                                                        |
|--------------------|--------------|--------------------------------|----------|--------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| `bridge_id`        | UUID (string)| **PK**                         | NO       | Surrogate key for this bridge row.                                                                           | Deduplication; row-level audit.                                                           |
| `recipe_sk`        | UUID (string)| FK → dim_recipe.recipe_sk      | NO       | Links to the specific recipe version containing this ingredient.                                             | SCD2-accurate ingredient list retrieval.                                                  |
| `ingredient_id`    | VARCHAR(60)  | FK → dim_ingredient            | NO       | Canonical ingredient reference.                                                                              | Ingredient co-occurrence analysis; substitution network graphs.                           |
| `quantity`         | DECIMAL(10,3)| CHECK >= 0                     | YES      | Numeric quantity as specified in the recipe. NULL for "to taste" entries.                                   | Scaling calculations; per-serving normalisation.                                          |
| `unit`             | VARCHAR(30)  | —                              | YES      | Unit for the quantity, e.g. `"g"`, `"cups"`, `"cloves"`. May differ from `dim_ingredient.unit_of_measure`. | Unit conversion pipeline; standardisation analysis.                                       |
| `preparation_note` | VARCHAR(200) | —                              | YES      | Preparation qualifier, e.g. `"finely diced"`, `"at room temperature"`, `"toasted"`.                        | Technique extraction for cooking skill inference.                                         |
| `is_optional`      | BOOLEAN      | DEFAULT FALSE                  | NO       | TRUE if the ingredient is listed as optional/garnish in the original recipe.                                | Minimum viable ingredient list construction; substitution permissiveness scoring.         |
| `display_order`    | INTEGER      | CHECK >= 1                     | NO       | 1-based position of this ingredient in the recipe ingredient list as displayed.                              | Preserves author-intended reading order; UI rendering.                                    |
| `section_label`    | VARCHAR(100) | —                              | YES      | Group label for multi-section recipes, e.g. `"For the marinade"`, `"For the sauce"`.                       | Section-level ingredient interaction tracking.                                            |

**Compound Unique Constraint:** `(recipe_sk, ingredient_id, section_label, display_order)`  
**Indexes:** `recipe_sk`, `ingredient_id`

---

## Fact Tables

---

### `fact_feed_sessions`

**Business Definition:** One row per discrete user feed session. A session begins when the feed view mounts and ends on explicit close, app backgrounding, or 30-minute inactivity timeout. Highest-level unit of feed engagement analysis.

| Column Name               | Data Type    | Constraints              | Nullable | Business Definition                                                                                          | Analytical Utility                                                                         |
|---------------------------|--------------|--------------------------|----------|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| `session_id`              | UUID (string)| **PK**                   | NO       | Client-generated UUID assigned at session initialisation (feed mount). Propagated to all child events.      | Primary grain key; join key for impressions and actions fact tables.                       |
| `user_sk`                 | UUID (string)| FK → dim_user.user_sk    | NO       | SCD2-accurate surrogate key for the user at session time.                                                   | User-dimension join preserving historical profile state.                                   |
| `user_id`                 | UUID (string)| —                        | NO       | Denormalised stable user business key for simplified non-SCD queries.                                       | Fast user-level aggregation without SCD2 resolution.                                       |
| `session_start_ts`        | TIMESTAMP    | —                        | NO       | UTC timestamp when the session was initiated (feed component mount event).                                  | Session bucketing by time-of-day, day-of-week; meal-time analysis.                         |
| `session_end_ts`          | TIMESTAMP    | —                        | YES      | UTC timestamp of session termination. NULL if session ended abnormally.                                     | Session duration calculation; drop-off analysis.                                           |
| `session_duration_ms`     | BIGINT       | CHECK >= 0               | YES      | Total session duration in milliseconds. NULL if `session_end_ts` is NULL.                                   | Engagement depth metric; median session duration KPI.                                      |
| `device_type`             | ENUM         | CHECK IN (...)           | NO       | One of: `mobile`, `tablet`, `desktop`. Inferred from User-Agent.                                            | Device-type performance segmentation; responsive UI impact analysis.                       |
| `os`                      | VARCHAR(30)  | —                        | YES      | Operating system, e.g. `"iOS"`, `"Android"`, `"macOS"`, `"Windows"`.                                      | OS-level crash correlation; feature adoption by platform.                                  |
| `browser`                 | VARCHAR(30)  | —                        | YES      | Browser family, e.g. `"Chrome"`, `"Safari"`, `"Firefox"`.                                                  | Browser-specific rendering bug attribution.                                                |
| `app_version`             | VARCHAR(20)  | —                        | YES      | Semantic version of the CulinaryFeed client, e.g. `"1.4.2"`.                                               | Version-cohort feature flag analysis; regression detection.                                |
| `network_type`            | ENUM         | CHECK IN (...)           | YES      | One of: `wifi`, `4g`, `5g`, `3g`, `2g`, `offline`, `unknown`.                                              | Network quality impact on feed load times and video play rates.                            |
| `feed_algorithm_version`  | VARCHAR(20)  | —                        | NO       | Version identifier of the recommendation algorithm that generated this session's feed.                      | A/B algorithm experiment attribution; ranking model version analysis.                      |
| `total_impressions`       | INTEGER      | DEFAULT 0                | NO       | Denormalised count of recipe cards shown during this session. Updated at session close.                     | Feed depth metric; scroll depth proxy.                                                     |
| `total_actions`           | INTEGER      | DEFAULT 0                | NO       | Denormalised count of meaningful user actions during this session.                                          | Engagement rate = `total_actions / total_impressions`.                                     |
| `scroll_depth_pct`        | DECIMAL(5,2) | CHECK 0-100              | YES      | Percentage of the feed list scrolled during the session (0.00–100.00).                                      | Content depth consumption; infinite-scroll trigger point analysis.                         |
| `entry_point`             | ENUM         | CHECK IN (...)           | YES      | One of: `home_tab`, `search`, `push_notification`, `deep_link`, `share_link`, `onboarding`.                | Attribution of session entry source; channel performance analysis.                         |
| `exit_reason`             | ENUM         | CHECK IN (...)           | YES      | One of: `manual_close`, `inactivity_timeout`, `navigation`, `app_background`, `crash`, `unknown`.          | Exit intent analysis; timeout threshold optimisation.                                      |

**Partitioning:** By `session_start_ts` (monthly)  
**Indexes:** `user_id`, `(session_start_ts, feed_algorithm_version)`, `entry_point`

---

### `fact_feed_impressions`

**Business Definition:** One row per recipe card rendered and visible to a user during a feed session. An impression is recorded when ≥50% of the card enters the viewport for ≥500ms (IAB viewability standard). Highest-volume fact table.

| Column Name            | Data Type    | Constraints                         | Nullable | Business Definition                                                                                        | Analytical Utility                                                                          |
|------------------------|--------------|-------------------------------------|----------|------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `impression_id`        | UUID (string)| **PK**                              | NO       | Client-generated UUID for this specific impression event.                                                  | Deduplication; row-level audit joins.                                                        |
| `session_id`           | UUID (string)| FK → fact_feed_sessions             | NO       | Parent session this impression belongs to.                                                                 | Session-level impression roll-up.                                                            |
| `user_id`              | UUID (string)| FK → dim_user (natural key)         | NO       | Denormalised user natural key for fast per-user impression queries.                                        | User-level CTR, save rate, cook rate calculations.                                           |
| `recipe_sk`            | UUID (string)| FK → dim_recipe.recipe_sk           | NO       | SCD2-accurate recipe version seen at impression time.                                                      | Accurate recipe attribute joins at the time of impression.                                   |
| `recipe_id`            | UUID (string)| —                                   | NO       | Denormalised stable recipe business key.                                                                   | Recipe-level aggregations without SCD2 resolution.                                           |
| `impression_ts`        | TIMESTAMP    | —                                   | NO       | UTC timestamp when the impression viewability threshold was first met.                                     | Time-series impression volume; hourly/daily trending.                                        |
| `feed_position`        | INTEGER      | CHECK >= 1                          | NO       | 1-based position of the recipe card in the feed at the time of impression.                                 | Position-bias analysis; above-the-fold vs. scroll depth CTR decay.                          |
| `card_format`          | ENUM         | CHECK IN (...)                      | NO       | One of: `standard`, `featured`, `video_autoplay`, `sponsored`, `creator_spotlight`.                       | Card format A/B testing; format-level engagement lift analysis.                              |
| `visible_duration_ms`  | BIGINT       | CHECK >= 500                        | NO       | Total milliseconds the card was in the viewable area during this impression event.                         | Attention signal beyond binary impression; dwell-time modelling.                             |
| `is_above_fold`        | BOOLEAN      | —                                   | NO       | TRUE if the card was fully visible without scrolling on initial session load.                              | First-screen performance; hero placement impact.                                             |
| `was_clicked`          | BOOLEAN      | DEFAULT FALSE                       | NO       | TRUE if any click/tap action was registered on this impression.                                            | Click-through rate (CTR = clicks / impressions).                                             |
| `heartbeat_count`      | INTEGER      | DEFAULT 0                           | NO       | Number of `IMPRESSION_HEARTBEAT` events received for this impression (each ~5s).                           | Prolonged attention detection; distinguishes passive scroll-past from genuine viewing.       |
| `scroll_velocity_px_s` | DECIMAL(10,2)| —                                   | YES      | Estimated scroll velocity (pixels/second) at the moment the card entered the viewport.                    | Scroll behaviour segmentation; fast-scrollers vs. browsers.                                 |
| `experiment_arm`       | VARCHAR(40)  | —                                   | YES      | A/B experiment identifier if this impression was part of a controlled experiment.                          | Experiment-level impression and conversion analysis.                                         |

**Partitioning:** By `impression_ts` (daily)  
**Indexes:** `session_id`, `user_id`, `recipe_id`, `(impression_ts, card_format)`, `experiment_arm`

---

### `fact_user_actions`

**Business Definition:** One row per discrete user interaction with a recipe card or its expanded detail view. Captures the full interaction funnel from lightweight hover events to high-intent "I Made This" declarations.

| Column Name          | Data Type    | Constraints                         | Nullable | Business Definition                                                                                        | Analytical Utility                                                                          |
|----------------------|--------------|-------------------------------------|----------|------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `action_id`          | UUID (string)| **PK**                              | NO       | Client-generated UUID for this specific action event.                                                      | Deduplication; event replay integrity checks.                                                |
| `session_id`         | UUID (string)| FK → fact_feed_sessions             | NO       | Parent session in which this action occurred.                                                              | Session-level action roll-up; sessions-with-actions rate.                                    |
| `impression_id`      | UUID (string)| FK → fact_feed_impressions          | YES      | The impression event that preceded/triggered this action. NULL for non-feed-card actions.                  | Impression-to-action conversion rate; position-bias attribution.                             |
| `user_id`            | UUID (string)| FK → dim_user (natural key)         | NO       | User performing the action.                                                                                | Per-user action funnel; loyalty and retention signal.                                        |
| `recipe_id`          | UUID (string)| FK → dim_recipe (natural key)       | NO       | Recipe on which the action was performed.                                                                  | Recipe-level action aggregations; content performance scores.                                |
| `ingredient_id`      | VARCHAR(60)  | FK → dim_ingredient                 | YES      | Specific ingredient involved if the action was ingredient-level. NULL otherwise.                           | Ingredient affinity signal; ingredient-click-to-pantry funnel.                               |
| `action_ts`          | TIMESTAMP    | —                                   | NO       | UTC timestamp when the action event was dispatched.                                                        | Time-series action volume; inter-action latency analysis.                                    |
| `action_type`        | ENUM         | CHECK IN (...)                      | NO       | One of: `recipe_expand`, `recipe_collapse`, `recipe_save`, `recipe_unsave`, `recipe_share`, `recipe_cook`, `ingredient_tap`, `ingredient_substitute_request`, `ingredient_add_to_list`, `rating_submit`, `comment_submit`, `creator_follow`, `creator_unfollow`. | Full interaction funnel tracking. |
| `action_value`       | JSON (object)| —                                   | YES      | Action-specific payload. Schema varies by `action_type`. See event_contracts.json for shape.               | Rich contextual data per action type; flexible schema for future action types.               |
| `client_ts`          | TIMESTAMP    | —                                   | NO       | Device-local timestamp when the action was recorded. Used for clock-skew detection.                        | Clock-skew analysis; offline/queued event ordering.                                          |
| `latency_ms`         | INTEGER      | —                                   | YES      | Server-assigned latency: `server_received_ts - client_ts`. NULL until server processing.                  | Event pipeline health monitoring; queue depth proxy.                                         |
| `ui_context`         | ENUM         | CHECK IN (...)                      | YES      | UI surface: `feed_card`, `recipe_detail`, `ingredient_panel`, `search_results`.                           | Surface-level conversion rate analysis; UI iteration prioritisation.                         |
| `sequence_in_session`| INTEGER      | CHECK >= 1                          | YES      | Ordinal position of this action within the session's action sequence.                                     | Action path analysis; common interaction sequences (session flow mining).                    |

**Partitioning:** By `action_ts` (daily)  
**Indexes:** `session_id`, `user_id`, `recipe_id`, `(action_ts, action_type)`, `ingredient_id`, `impression_id`

---

## Entity Relationship Diagram

```
dim_user ────────────────────────────────────────────────┐
  │ user_sk                                               │
  │                                                       ▼
  ├───────── fact_feed_sessions ◄──── fact_feed_impressions ◄──── fact_user_actions
  │            session_id (PK)            impression_id (PK)          action_id (PK)
  │            user_sk (FK)              session_id (FK)              session_id (FK)
  │                                      user_id (FK)                 impression_id (FK)
  │                                      recipe_sk (FK)               user_id (FK)
  │                                            │                      recipe_id (FK)
  │                                            │                      ingredient_id (FK)
  │                                            ▼                           │
  │                                      dim_recipe ◄──────────────────────
  │                                        recipe_sk (PK)
  │                                        cuisine_id (FK) ──► dim_cuisine
  │                                             │
  │                              bridge_recipe_ingredient
  │                                recipe_sk (FK)
  │                                ingredient_id (FK) ──► dim_ingredient
  │
  └── (creator_user_id on dim_recipe links back to dim_user.user_id)
```

---

## Constraint & Type Legend

| Notation        | Meaning                                                   |
|-----------------|-----------------------------------------------------------|
| **PK**          | Primary Key — uniquely identifies each row                |
| **FK**          | Foreign Key — references a column in another table        |
| UNIQUE          | Uniqueness constraint — no duplicate values allowed       |
| CHECK IN (...)  | Enumerated set constraint — value must be in defined list |
| DEFAULT         | Column default value when not specified on insert         |
| COMPUTED        | Column value is derived from other columns                |
| UUID            | Stored as VARCHAR(36) in SQL or string in JS layer        |
| TIMESTAMP       | ISO-8601 UTC string at rest; Date object in JS layer      |
| JSON            | Serialised JSON string in SQL; native object/array in JS  |
| ENUM            | CHECK constraint in SQL; string union in JS JSDoc         |
| BIGINT          | 64-bit integer; number in JS (safe for ms timestamps)     |

---

*Generated by: CulinaryFeed Data Engineering Team*
*Schema Version 1.0.0 — Phase 1 Data Foundations*
