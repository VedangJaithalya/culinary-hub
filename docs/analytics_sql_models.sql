-- =============================================================================
-- FILE:    docs/analytics_sql_models.sql
-- PROJECT: CulinaryFeed — Phase 3, Pass 3
--
-- PURPOSE
-- -------
-- These are the PRODUCTION SQL WAREHOUSE equivalents of the client-side
-- telemetry engine implemented in JavaScript (src/analytics/).  They are
-- designed to be run as scheduled dbt models, Snowflake Tasks, BigQuery
-- Scheduled Queries, or executed directly in DuckDB for local development.
--
-- The four models below replicate — deterministically and at scale — the
-- same scoring and session-reconstruction logic that lives in the browser,
-- so that data scientists can validate client behaviour against ground truth
-- and serve pre-computed affinity vectors back to the recommendation layer.
--
-- COMPATIBILITY
-- -------------
-- All SQL is written to the ANSI SQL:2003 standard with the following
-- dialect notes called out inline where functions diverge:
--   • BigQuery  : DATE_TRUNC uses string literals ('week'); TIMESTAMP_DIFF
--                 replaces DATEDIFF.
--   • Snowflake : DATEDIFF('minute', ...) is the native form; DATE_TRUNC
--                 accepts ('week', col) positional syntax.
--   • DuckDB    : DATE_DIFF('minute', ...) / DATE_TRUNC('week', col).
--
-- GRAIN SUMMARY
-- ─────────────────────────────────────────────────────────────────────────────
--  MODEL 1 — event_sessionization      : 1 row per raw telemetry event
--  MODEL 2 — impression_feature_store  : 1 row per impression_id
--  MODEL 3 — user_affinity_vector      : 1 row per (user_id, cuisine_id)
--  MODEL 4 — weekly_cohort_retention   : 1 row per (cohort_week, week_number)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- AUTHOR:  Analytics Engineering — CulinaryFeed
-- UPDATED: 2026-08-26
-- =============================================================================


-- #############################################################################
-- MODEL 1: EVENT_SESSIONIZATION
-- The "Gaps and Islands" Problem
-- #############################################################################
--
-- CONTEXT
-- -------
-- Raw events arrive from the browser SDK with a user_id and a client-side
-- timestamp, but with no concept of "session".  A session is defined as a
-- continuous sequence of events where no two consecutive events for the same
-- user are separated by more than 30 minutes of idle time.
--
-- APPROACH — THREE-STEP GAPS-AND-ISLANDS
-- Step A : LAG()  — look back at the previous event's timestamp per user.
-- Step B : Flag   — mark the first event in a new island (gap > 30 min or NULL).
-- Step C : SUM()  — running total of flags becomes the session identifier.
--
-- This pattern produces a deterministic, monotonically increasing session
-- counter per user that survives query re-execution without duplicating rows.
--
-- SOURCE TABLE: raw_telemetry_events
-- ─────────────────────────────────
--   event_id             STRING    — UUID assigned by the SDK
--   user_id              STRING    — authenticated user or device fingerprint
--   event_timestamp      TIMESTAMP — UTC moment the event fired
--   event_name           STRING    — e.g. RECIPE_IMPRESSION, RECIPE_EXPAND
--   impression_id        STRING    — groups events for a single recipe card view
--   recipe_id            STRING    — foreign key → recipes dimension
--   cuisine_id           STRING    — foreign key → cuisines dimension
--   ingredient_id        STRING    — NULL unless action = 'checked'
--   action               STRING    — e.g. 'checked', 'unchecked', 'scrolled'
--   cumulative_dwell_ms  BIGINT    — ms the card has been visible (from browser)
--   total_ingredients_in_recipe INT — denormalised count from recipe payload
-- ─────────────────────────────────

WITH

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP A: Calculate the idle gap between each event and the one before it
--         for the same user, using the LAG() window function.
--
--   NULLIF guard: if prev_event_timestamp IS NULL, this is the user's very
--   first event ever — the gap is undefined, not zero.
--
-- Dialect note:
--   BigQuery  : TIMESTAMP_DIFF(event_timestamp, prev_ts, MINUTE)
--   Snowflake : DATEDIFF('minute', prev_ts, event_timestamp)
--   DuckDB    : DATE_DIFF('minute', prev_ts, event_timestamp)
--   ANSI used below; swap the function call to match your warehouse.
-- ─────────────────────────────────────────────────────────────────────────────
events_with_lag AS (
    SELECT
        event_id,
        user_id,
        event_timestamp,
        event_name,
        impression_id,
        recipe_id,
        cuisine_id,
        ingredient_id,
        action,
        cumulative_dwell_ms,
        total_ingredients_in_recipe,

        -- Capture the timestamp of the immediately preceding event for this user.
        LAG(event_timestamp) OVER (
            PARTITION BY user_id
            ORDER BY     event_timestamp ASC
        ) AS prev_event_timestamp,

        -- Compute the idle gap in minutes.
        -- EXTRACT(EPOCH FROM ...) is ANSI-ish; adjust per dialect (see notes above).
        EXTRACT(
            EPOCH FROM (event_timestamp - LAG(event_timestamp) OVER (
                PARTITION BY user_id
                ORDER BY     event_timestamp ASC
            ))
        ) / 60.0 AS idle_gap_minutes

    FROM raw_telemetry_events
),

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP B: Raise a new_session_flag wherever an "island" begins.
--
--   A new session starts when:
--     1. The idle gap is NULL  → first event ever for this user, or
--     2. The idle gap > 30 min → user returned after a meaningful absence.
--
--   The 30-minute threshold matches the client-side SESSION_TIMEOUT_MS = 1_800_000
--   constant defined in src/analytics/session-manager.js.
-- ─────────────────────────────────────────────────────────────────────────────
events_with_session_flag AS (
    SELECT
        *,
        CASE
            WHEN idle_gap_minutes IS NULL THEN 1   -- very first event for user
            WHEN idle_gap_minutes > 30    THEN 1   -- gap exceeds 30-minute timeout
            ELSE                               0   -- still within the same session
        END AS new_session_flag

    FROM events_with_lag
),

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP C: Running sum of flags → deterministic backend session identifier.
--
--   Because new_session_flag is 1 at the start of every new island and 0
--   inside an island, a cumulative sum partitioned by user_id increments
--   exactly once per session, giving each session a stable integer key.
--
--   The final session_id is a composite string: '<user_id>_<session_counter>'
--   to avoid collisions across users and to make foreign-key lookups readable.
-- ─────────────────────────────────────────────────────────────────────────────
event_sessionization AS (
    SELECT
        event_id,
        user_id,
        event_timestamp,
        event_name,
        impression_id,
        recipe_id,
        cuisine_id,
        ingredient_id,
        action,
        cumulative_dwell_ms,
        total_ingredients_in_recipe,
        idle_gap_minutes,
        new_session_flag,

        -- The cumulative-sum trick: each 1 in new_session_flag advances the counter.
        SUM(new_session_flag) OVER (
            PARTITION BY user_id
            ORDER BY     event_timestamp ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS session_counter,

        -- Readable composite key suitable for use as a foreign key downstream.
        user_id || '_' || CAST(
            SUM(new_session_flag) OVER (
                PARTITION BY user_id
                ORDER BY     event_timestamp ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS VARCHAR
        ) AS session_id

    FROM events_with_session_flag
),


-- #############################################################################
-- MODEL 2: IMPRESSION_FEATURE_STORE
-- Aggregating Events → Impression Grain with Heuristic Scoring
-- #############################################################################
--
-- CONTEXT
-- -------
-- A single recipe card impression generates multiple events over its lifetime
-- (scroll-into-view, dwell ticks, ingredient checks, expand, scroll-out).
-- This model collapses that event stream to ONE row per impression_id and
-- replicates the four scoring components computed client-side in
-- src/analytics/affinity-engine.js → _scoreImpression().
--
-- SCORING COMPONENTS (mirroring client-side constants)
-- ─────────────────────────────────────────────────────────────────────────────
--   DWELL_SCORE   = LEAST(max_dwell_ms / 10000.0, 2.0)
--                   Rewards time-on-card up to a 2-point ceiling (10s = max).
--
--   EXPAND_BONUS  = 2.5 if user opened the detail drawer, else 0.0
--                   A strong positive signal that the recipe caught attention.
--
--   SKIP_PENALTY  = -1.5 if max_dwell_ms < 2000 AND no expand occurred
--                   Penalises rapid swipe-past behaviour (< 2-second glance).
--
--   PREP_RATIO    = (checked_ingredients / total_ingredients) * 3.0
--                   Measures cooking intent: actually ticking off shopping list
--                   items is the strongest engagement signal in the model.
--
--   composite_score = dwell_score + expand_bonus + skip_penalty + prep_ratio
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SOURCE: event_sessionization CTE from Model 1
-- ─────────────────────────────────────────────────────────────────────────────

impression_raw_agg AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Collapse all events for each impression into a single summary row.
    -- We preserve the identifiers needed for downstream joins and grouping.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        impression_id,
        user_id,
        session_id,
        recipe_id,
        cuisine_id,

        -- Session context: the moment this impression first appeared.
        MIN(event_timestamp)                         AS impression_start_at,
        MAX(event_timestamp)                         AS impression_end_at,

        -- Dwell: the client sends cumulative_dwell_ms on every tick event;
        -- we take the MAX to capture the total dwell at the end of the impression.
        MAX(cumulative_dwell_ms)                     AS max_dwell_ms,

        -- Expand: did the user open the recipe detail drawer?
        MAX(CASE
            WHEN event_name = 'RECIPE_EXPAND' THEN 1
            ELSE 0
        END)                                         AS did_expand,

        -- Checked ingredients: COUNT DISTINCT avoids double-counting re-checks.
        COUNT(DISTINCT CASE
            WHEN action = 'checked' THEN ingredient_id
        END)                                         AS checked_ingredient_count,

        -- Total ingredients in recipe (denormalised, same for all events on one recipe).
        MAX(total_ingredients_in_recipe)             AS total_ingredients

    FROM event_sessionization
    GROUP BY
        impression_id,
        user_id,
        session_id,
        recipe_id,
        cuisine_id
),

impression_feature_store AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Apply the heuristic scoring formula to each aggregated impression row.
    -- Each component is computed individually so it can be audited or ablated.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        impression_id,
        user_id,
        session_id,
        recipe_id,
        cuisine_id,
        impression_start_at,
        impression_end_at,
        max_dwell_ms,
        did_expand,
        checked_ingredient_count,
        total_ingredients,

        -- COMPONENT 1: Dwell Score
        -- Normalise dwell to a 0–2 scale. Dividing by 10 000 converts ms → a
        -- score where 10 seconds = 1.0, 20 seconds = 2.0, 30+ seconds = 2.0.
        -- LEAST() enforces the 2-point ceiling from the client-side model.
        LEAST(max_dwell_ms / 10000.0, 2.0)           AS dwell_score,

        -- COMPONENT 2: Expand Bonus
        -- A binary 2.5-point bonus: opening the detail view is a strong signal.
        CASE WHEN did_expand = 1 THEN 2.5 ELSE 0.0 END
                                                     AS expand_bonus,

        -- COMPONENT 3: Skip Penalty
        -- Applies only when the card was dismissed quickly (< 2 000 ms) AND
        -- the user never expanded, indicating genuine disinterest.
        CASE
            WHEN max_dwell_ms < 2000 AND did_expand = 0 THEN -1.5
            ELSE 0.0
        END                                          AS skip_penalty,

        -- COMPONENT 4: Prep Ratio
        -- Checked ingredients / total ingredients, scaled by 3.0.
        -- NULLIF guard prevents division-by-zero on recipes with no ingredients
        -- (e.g., curated collections or placeholder cards).
        (
            checked_ingredient_count * 1.0
            /
            NULLIF(total_ingredients, 0)
        ) * 3.0                                      AS prep_ratio,

        -- COMPOSITE SCORE
        -- The final impression score passed to the affinity vector model.
        -- NULLs in prep_ratio (zero-ingredient recipes) are treated as 0
        -- via COALESCE so that missing data does not poison the total.
        LEAST(max_dwell_ms / 10000.0, 2.0)
        + CASE WHEN did_expand = 1 THEN 2.5 ELSE 0.0 END
        + CASE WHEN max_dwell_ms < 2000 AND did_expand = 0 THEN -1.5 ELSE 0.0 END
        + COALESCE(
            (checked_ingredient_count * 1.0 / NULLIF(total_ingredients, 0)) * 3.0,
            0.0
          )                                          AS composite_score

    FROM impression_raw_agg
),


-- #############################################################################
-- MODEL 3: USER_AFFINITY_VECTOR
-- Aggregation, Soft-ReLU Flooring, and Probability Normalisation
-- #############################################################################
--
-- CONTEXT
-- -------
-- This model reduces the impression-level feature store to the (user, cuisine)
-- grain that powers the recommendation feed.  The output is a normalised
-- probability weight per cuisine per user — directly comparable to the
-- affinityVector computed in src/analytics/affinity-engine.js → getAffinityVector().
--
-- THREE-STAGE PIPELINE
-- ─────────────────────────────────────────────────────────────────────────────
--   Stage 1 — RAW SCORE     : SUM all composite scores per (user, cuisine).
--   Stage 2 — SOFT-ReLU     : GREATEST(0, raw_score) floors negatives at 0.
--                             This prevents cuisines with net-negative signals
--                             (all skips, no dwells) from dragging probabilities
--                             below zero, which would break the normalisation step.
--   Stage 3 — NORMALISATION : Divide each floored score by the SUM of all
--                             floored scores for that user, yielding weights
--                             that sum to 1.0 across all cuisines per user.
-- ─────────────────────────────────────────────────────────────────────────────

user_cuisine_raw AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Stage 1: Aggregate to (user_id, cuisine_id) grain.
    -- SUM the composite score across all impressions in the feature store.
    -- COUNT metrics are included for audit and debugging purposes.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        user_id,
        cuisine_id,

        COUNT(DISTINCT impression_id)   AS total_impressions,
        COUNT(DISTINCT session_id)      AS total_sessions,

        -- Raw additive score: can be negative if skip penalties dominate.
        SUM(composite_score)            AS raw_score,

        -- Sub-component sums for explainability / feature debugging.
        SUM(dwell_score)                AS total_dwell_score,
        SUM(expand_bonus)               AS total_expand_bonus,
        SUM(skip_penalty)               AS total_skip_penalty,
        SUM(prep_ratio)                 AS total_prep_ratio,

        MAX(impression_end_at)          AS last_seen_at

    FROM impression_feature_store
    GROUP BY
        user_id,
        cuisine_id
),

user_cuisine_floored AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Stage 2: Soft-ReLU flooring.
    -- GREATEST(0, raw_score) is equivalent to max(x, 0) in Python/JavaScript.
    -- This ensures all inputs to the normalisation step are non-negative,
    -- preserving the semantics of a probability distribution.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        *,
        GREATEST(0.0, raw_score)        AS floored_score

    FROM user_cuisine_raw
),

user_affinity_vector AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Stage 3: Probability normalisation via window SUM.
    --
    -- The denominator is the sum of all floored_scores for the same user,
    -- computed using a window function so we can keep all cuisine rows.
    -- NULLIF guards against the degenerate case where a user's entire affinity
    -- is zeroed out by Soft-ReLU (i.e., they skipped every single impression).
    -- In that scenario, probability_weight is NULL, which the application layer
    -- can interpret as "uniform prior" and fall back to editorial ranking.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        user_id,
        cuisine_id,
        total_impressions,
        total_sessions,
        raw_score,
        floored_score,
        total_dwell_score,
        total_expand_bonus,
        total_skip_penalty,
        total_prep_ratio,
        last_seen_at,

        -- The per-user total of floored scores, used in the denominator.
        SUM(floored_score) OVER (
            PARTITION BY user_id
        )                                            AS user_total_floored_score,

        -- Final probability weight: sums to 1.0 across all cuisines per user.
        floored_score
        /
        NULLIF(
            SUM(floored_score) OVER (PARTITION BY user_id),
            0.0
        )                                            AS probability_weight,

        -- Ordinal rank within the user's affinity vector (1 = most preferred).
        -- Useful for "top-N cuisine" queries without an ORDER BY.
        RANK() OVER (
            PARTITION BY user_id
            ORDER BY     floored_score DESC
        )                                            AS affinity_rank

    FROM user_cuisine_floored
),


-- #############################################################################
-- MODEL 4: WEEKLY_COHORT_RETENTION
-- Cohort Assignment, Relative Week Calculation, and Retention Curve
-- #############################################################################
--
-- CONTEXT
-- -------
-- Retention analysis answers: "Of the users who first appeared in week W,
-- what percentage came back in week W+1, W+2, ... W+N?"
--
-- This is a standard product-analytics cohort model.  It is computed from
-- the sessionized events (Model 1) so that "activity" means "started a session",
-- not merely "fired an event" — eliminating SDK noise from the retention signal.
--
-- DEFINITIONS
-- ─────────────────────────────────────────────────────────────────────────────
--   cohort_week   : The ISO week (Monday–Sunday) in which the user was first
--                   seen.  Uses DATE_TRUNC('week', ...) — Monday-anchored.
--   session_week  : The ISO week in which a subsequent session occurred.
--   week_number   : session_week - cohort_week in whole weeks (0, 1, 2, …).
--   retained_users: COUNT(DISTINCT user_id) active in that (cohort, week_number).
--   cohort_size   : COUNT(DISTINCT user_id) at week_number = 0 (first-week size).
--   retention_pct : retained_users / cohort_size * 100, the classic metric.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Dialect notes for DATE_TRUNC:
--   BigQuery  : DATE_TRUNC(DATE(session_start_at), WEEK(MONDAY))
--   Snowflake : DATE_TRUNC('week', session_start_at)
--   DuckDB    : DATE_TRUNC('week', session_start_at)
-- ─────────────────────────────────────────────────────────────────────────────

session_spine AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Build one row per (user_id, session_id) from the sessionized events.
    -- We take MIN(event_timestamp) as the session start — the moment the first
    -- event of the session fired.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        user_id,
        session_id,
        MIN(event_timestamp)             AS session_start_at,
        MAX(event_timestamp)             AS session_end_at,

        -- The ISO week this session falls into (Monday-anchored).
        DATE_TRUNC('week', CAST(MIN(event_timestamp) AS DATE))
                                         AS session_week

    FROM event_sessionization
    GROUP BY
        user_id,
        session_id
),

user_cohort_assignment AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Assign each user to their cohort: the earliest week in which they had
    -- any session.  This is computed once per user and joined back to all
    -- sessions for relative-week arithmetic.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        user_id,

        -- Cohort = the first ISO week the user ever appeared.
        MIN(session_week)                AS cohort_week

    FROM session_spine
    GROUP BY user_id
),

sessions_with_cohort AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Join every session back to its cohort week, then calculate how many whole
    -- weeks have elapsed between cohort_week and session_week.
    --
    -- DATEDIFF semantics (adjust per dialect):
    --   BigQuery  : DATE_DIFF(session_week, cohort_week, WEEK)
    --   Snowflake : DATEDIFF('week', cohort_week, session_week)
    --   DuckDB    : DATE_DIFF('week', cohort_week, session_week)
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        s.user_id,
        s.session_id,
        s.session_start_at,
        s.session_week,
        c.cohort_week,

        -- Relative week offset: 0 = cohort week, 1 = one week later, etc.
        -- Cast to INT to ensure whole-number week arithmetic across dialects.
        CAST(
            (
                EXTRACT(EPOCH FROM (s.session_week - c.cohort_week))
                / (7 * 24 * 60 * 60)        -- seconds in one week
            ) AS INT
        )                                    AS week_number

    FROM session_spine          AS s
    INNER JOIN user_cohort_assignment AS c
        ON s.user_id = c.user_id
),

cohort_activity AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Aggregate to the (cohort_week, week_number) grain.
    -- COUNT DISTINCT user_id ensures each user is counted at most once per cell,
    -- regardless of how many sessions they had in a given week.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        cohort_week,
        week_number,
        COUNT(DISTINCT user_id)          AS retained_users

    FROM sessions_with_cohort
    GROUP BY
        cohort_week,
        week_number
),

cohort_sizes AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Extract the Week-0 (acquisition week) count for each cohort.
    -- This is the denominator for retention percentage calculations.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        cohort_week,
        retained_users                   AS cohort_size

    FROM cohort_activity
    WHERE week_number = 0
),

weekly_cohort_retention AS (
    -- ─────────────────────────────────────────────────────────────────────────
    -- Final output: join cohort sizes back to the activity grid and calculate
    -- the retention percentage for every (cohort_week, week_number) cell.
    --
    -- NULLIF on cohort_size guards against synthetic Week-0 data gaps (e.g.,
    -- if the raw data is missing events from a cohort's first week).
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        a.cohort_week,
        a.week_number,
        s.cohort_size,
        a.retained_users,

        -- Retention rate as a percentage, rounded to two decimal places.
        ROUND(
            (a.retained_users * 100.0)
            /
            NULLIF(s.cohort_size, 0),
            2
        )                                AS retention_pct

    FROM cohort_activity          AS a
    INNER JOIN cohort_sizes       AS s
        ON a.cohort_week = s.cohort_week
)

-- ─────────────────────────────────────────────────────────────────────────────
-- FINAL SELECT — weekly cohort retention curve
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    cohort_week,
    week_number,
    cohort_size,
    retained_users,
    retention_pct
FROM weekly_cohort_retention
ORDER BY
    cohort_week  ASC,
    week_number  ASC;


-- =============================================================================
-- END OF FILE: docs/analytics_sql_models.sql
-- =============================================================================
