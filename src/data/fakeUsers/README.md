# Fake User Datasets

20 synthetic users for exercising `generateUserAffinityVector` (`src/analytics/affinityModel.js`)
and `generateRankedFeed` (`src/engine/rankingEngine.js`) against a variety of engagement
patterns instead of just one real browser's history.

Each user has:

- A `DimUser`-shaped profile entry in **`mockUsers.json`** (matches the `DimUser` typedef in
  `src/data/dataContracts.js`).
- A raw telemetry dataset in **`events/<userId>.json`** — an array of `EventEnvelope` objects
  in the exact shape `telemetryService.dispatchTelemetry` produces and
  `sessionTransformer.transformRawEvents` consumes (`IMPRESSION_HEARTBEAT`, `RECIPE_EXPAND`,
  `INGREDIENT_INTERACTION`, `RECIPE_LIKE`, `RECIPE_SAVE`).
- An entry in **`manifest.json`** describing the persona, the generation rule ("algorithm
  design") that produced their events, and their resulting top cuisines by raw impression count.

## Loading a dataset for testing

The app reads history from a single `localStorage['culinaryfeed_events']` key (see
`telemetryService.js` / `sessionTransformer.js`), so only one fake user's dataset is "active" at
a time. To test how the feed ranks for a given persona, open the app, then in the browser
DevTools console:

```js
fetch('/src/data/fakeUsers/events/usr_fake_01_italian_loyalist.json')
  .then(r => r.json())
  .then(events => {
    localStorage.setItem('culinaryfeed_events', JSON.stringify(events))
    location.reload()
  })
```

(or paste the file's contents directly into `JSON.stringify(...)` above). After reload,
`window.debugAffinity()` and `window.debugAnalytics()` (both already wired up as devtools
globals) will reflect that user's simulated history, and the feed queue from `useFeedRanking`
will be ranked accordingly. Use `usr_fake_10_cold_start_new.json` (an empty array) to reset back
to the cold-start uniform distribution.

## The 20 personas ("algorithm designs")

| # | user_id | Persona | Algorithm design |
|---|---------|---------|-------------------|
| 1 | `usr_fake_01_italian_loyalist` | Single-cuisine loyalist | Repeatedly revisits the same 2 Italian recipes at "love" intensity across 3 sessions; everything else is a fast skip/glance. |
| 2 | `usr_fake_02_asian_explorer` | Regional cluster fan | Samples broadly across an 8-cuisine East/Southeast-Asian cluster at like/love, small amount of out-of-cluster noise. |
| 3 | `usr_fake_03_vegan_health` | Dietary-driven, cuisine-agnostic | Filters the catalogue by `dietary_tags` (vegan/vegetarian) instead of cuisine; always fully checks ingredients. |
| 4 | `usr_fake_04_spice_chaser` | Tag-driven | Filters by the `spicy` tag across every cuisine; mild dishes get an instant skip. |
| 5 | `usr_fake_05_easy_weeknight` | Difficulty-driven | Only engages with `difficulty_tier: easy` recipes; high save rate (meal planning). |
| 6 | `usr_fake_06_gourmet_expert` | Difficulty-driven (inverse) | Only engages with `difficulty_tier: advanced` recipes at high intensity. |
| 7 | `usr_fake_07_novelty_seeker` | Max-entropy sampler | Draws one fresh recipe from a different random cuisine every time — never settles on a favourite. |
| 8 | `usr_fake_08_power_superfan` | High-intensity / broad coverage | Large batches (10-15 recipes/session) at love/like across most of the catalogue — dense affinity vector stress test. |
| 9 | `usr_fake_09_passive_scroller` | Near-zero signal | Broad sampling, but every impression is a sub-2s skip — floors to the uniform cold-start distribution. |
| 10 | `usr_fake_10_cold_start_new` | True cold start | Zero events. Exercises the uniform-distribution fallback path directly. |
| 11 | `usr_fake_11_churn_negative` | Explicit negative engagement | Every impression is a sub-second dislike/skip — verifies floored-at-zero scores never go negative. |
| 12 | `usr_fake_12_mediterranean_comfort` | Regional cluster fan | Mediterranean / Lebanese / Moroccan / Turkish cluster, high save rate (meal-prep batching). |
| 13 | `usr_fake_13_latin_fiesta` | Regional cluster fan | Mexican / Peruvian / Brazilian / Argentinian / Caribbean cluster. |
| 14 | `usr_fake_14_random_noise` | Pure random / adversarial | Every field (dwell, expand, like, save, checked count) is uniform random, independent of any recipe attribute. |
| 15 | `usr_fake_15_breakfast_lover` | Tag + time-of-day driven | Filters by breakfast/brunch tags; all sessions start 07:00-08:00. |
| 16 | `usr_fake_16_binge_then_dropout` | Single-session binge | One very long, high-intensity North Indian session 140 days ago, then nothing since. |
| 17 | `usr_fake_17_drifting_taste` | Multi-session taste drift | Each session (oldest→newest) targets a different cuisine: North Indian → Korean → French. |
| 18 | `usr_fake_18_save_hoarder` | Save-heavy, low engagement | Nearly every impression is "save for later" with minimal dwell/expand/like signal. |
| 19 | `usr_fake_19_completionist_prepper` | Ingredient-checklist focused | Indian-subcontinent cluster; always checks 100% of ingredients with long dwell. |
| 20 | `usr_fake_20_anti_fan_german` | Isolated negative signal | Likes/loves a rotating set of cuisines but always instantly skips German recipes — isolates the skip-penalty term. |

Regenerate or tweak any persona's generation rule in the corresponding entry of the generator
that produced this folder — each persona is defined by a `(filters, engagement levels, session
timing)` spec, so new personas are cheap to add.
