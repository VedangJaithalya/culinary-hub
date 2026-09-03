# CulinaryHub

A TikTok-style recipe discovery feed with a real, from-scratch recommendation
engine underneath, built as a personal portfolio project by
**Vedang Jaithalya**.

This is a local build, not a production deploy. There's no backend, no
database, no live users, and no hosting. Every piece of state (recipes,
telemetry, saves, likes, the meal planner, the shopping list) lives in the
browser's `localStorage`. Run it locally with `npm run dev` and it's a fully
working app; nothing here assumes a server exists.

## What's actually in it

- A full swipeable recipe feed: cook mode with a step timer, a meal planner,
  a shopping list, saves/likes/follows, search, and a first-run onboarding
  survey.
- A real recommendation engine, not a mock: a multi-dimensional user affinity
  model (cuisine, difficulty, dietary tags, and content tags, each tracked
  independently), 14-day recency decay, a UCB1 exploration bandit, a
  diversity constraint that keeps any one cuisine from dominating the feed,
  and Jaccard-similarity-based "more like this."
- 60 recipes across 30 cuisines, and 20 synthetic user personas (see below)
  used to exercise the engine against a range of behavior patterns since
  there's no real user base yet.

## Getting started

```bash
npm install
npm run dev
```

Opens the Vite dev server (default `http://localhost:5173`). That's the
supported way to run this, since there's no deployed instance to point at.

Other scripts, from `package.json`:

- `npm run build`: production bundle via Vite (not currently deployed anywhere)
- `npm run lint`: ESLint
- `npm run preview`: serve the built bundle locally

## Stack

React 19 · Vite 8 · Tailwind CSS v4 · ESLint 10. Zero backend. The ranking
and affinity modules (`src/engine/rankingEngine.js`,
`src/analytics/affinityModel.js`) are pure, dependency-free ES6+ functions,
with no runtime deps beyond React itself for the UI layer.

## Project structure

```
src/
  components/    UI: FeedContainer, FeedCard, RecipeModal, CookModeView,
                 MealPlannerModal, ShoppingListDrawer, SavedDrawer,
                 OnboardingModal, SearchOverlay, CreatorProfileModal,
                 PrintableRecipe, StarRating
  engine/        rankingEngine.js (scoring + diversity constraint),
                 searchEngine.js, similarityEngine.js
  analytics/     sessionTransformer.js (raw telemetry → session/impression
                 facts), affinityModel.js (multi-dimensional affinity vector)
  services/      One localStorage-backed service per concern: telemetry,
                 dismiss, follow, like, meal plan, rating, share, shopping
                 list, user profile, cook
  data/          mockRecipes.json (60 recipes / 30 cuisines), mockCreators.json,
                 dataContracts.js (event + type contracts), fakeUsers/ (20
                 synthetic personas, see below)
docs/            Phase-1 data-model design docs (schema_dictionary.md,
                 event_contracts.json, analytics_sql_models.sql), a
                 Kimball-style star schema written during planning, kept for
                 reference. Nothing in the shipped app writes to a warehouse;
                 every fact table it describes is reconstructed on the fly,
                 client-side, by sessionTransformer.js from the localStorage
                 event log.
dashboards/      Two self-contained HTML reports (see below).
```

## How the recommendation engine works

Every interaction (dwell time, expand, like, save, dismiss, ingredients
checked) becomes a scored engagement event, recency-decayed with a 14-day
half-life. `affinityModel.js` turns accumulated events into a per-user
probability distribution across four independent dimensions: cuisine,
difficulty, dietary tags, content tags. `rankingEngine.js` scores every
unseen recipe (cuisine weighted ×1.0, the other three dimensions ×0.3 each),
adds a UCB1 exploration bonus for under-shown cuisines, sorts, then
re-sequences the result so no cuisine appears more than twice in any 5-card
window. A brand-new user with no history yet falls back to a
preference-weighted distribution seeded by the onboarding survey.

For the full write-up (architecture, the exact scoring formula, and
measured benchmark numbers: re-rank latency, diversity-cap enforcement under
skew, cold-start convergence speed), see
`dashboards/culinaryfeed-case-study.html`.

## Testing against synthetic users

`src/data/fakeUsers/` ships 20 synthetic personas (single-cuisine loyalist,
dietary-driven, tag-driven, cold-start, adversarial noise, taste-drift over
time, and more), each with a `DimUser` profile in `mockUsers.json` and a raw
telemetry history in `events/<userId>.json`. The app only reads one active
user's history at a time from `localStorage['culinaryfeed_events']`; to load
a persona, open the app and in the DevTools console:

```js
fetch('/src/data/fakeUsers/events/usr_fake_01_italian_loyalist.json')
  .then(r => r.json())
  .then(events => {
    localStorage.setItem('culinaryfeed_events', JSON.stringify(events))
    location.reload()
  })
```

`window.debugAffinity()` and `window.debugAnalytics()` are wired up as
DevTools console globals for inspecting the resulting affinity vector and
session facts. Full persona list and generation rules:
`src/data/fakeUsers/README.md`.

## Reports

Two standalone HTML files in `dashboards/`, with no build step and no
server. Open either directly in a browser:

- **`culinaryfeed-dashboard.html`**: an internal-style leadership dashboard:
  roadmap/feature-completion status, persona and user breakdowns, recipe
  catalog stats. Self-contained: every chart is hand-rolled inline SVG/CSS,
  no charting library. The only outbound request either file makes is a
  Google Fonts stylesheet fetch; everything else renders locally.
- **`culinaryfeed-case-study.html`**: the public-facing portfolio write-up
  of the engineering: architecture, the ranking algorithm, the verification
  methodology, and measured benchmark numbers. Credited to
  [Vedang Jaithalya](https://github.com/VedangJaithalya/culinary-hub).

Every number in both was computed from the app's actual data: the real
recipe catalog (`src/data/mockRecipes.json`) and the real persona telemetry
(`src/data/fakeUsers/`), not estimated or invented. If that underlying data
changes, the reports should be regenerated to match.

## Status

14/15 roadmap items shipped (tracked in the dashboard). This is a finished
personal build, run locally, not deployed and not handling production traffic.
