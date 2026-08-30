# CulinaryFeed Dashboards

Two standalone, self-contained HTML reports generated from CulinaryFeed's real
app data (recipe catalog, synthetic personas, and telemetry events). Each file
has no build step and no dependencies beyond a CDN script tag or two — open it
directly in a browser, or host it anywhere that serves static files.

## Files

### `culinaryfeed-dashboard.html` — Leadership Dashboard

An internal-facing overview of the app, its users, and its data, built for a
leadership/stakeholder audience.

- **App**: architecture flow, roadmap/feature-completion status across the
  four build phases, stack footprint.
- **Users**: skill/account/archetype breakdowns, region and continent mix,
  per-persona engagement (like/save/expand rates), and the full 20-persona
  table — all sourced from the app's synthetic persona set.
- **Data**: recipe corpus stats (cuisines, difficulty, dietary tags, pantry/
  ingredient breakdown, top ingredients and tags), rating/save/cook
  leaderboards, time and calorie distributions, and a creator leaderboard.
- Built with Chart.js (loaded from cdnjs) for all charts.

### `culinaryfeed-case-study.html` — Portfolio Case Study

A public-facing engineering + product narrative built for a portfolio,
LinkedIn, or GitHub audience, credited to **Vedang Jaithalya**
([github.com/VedangJaithalya/culinary-hub](https://github.com/VedangJaithalya/culinary-hub)).

Walks through the recommendation engine end to end: how a recommendation
happens (feed → telemetry → session transform → affinity model → ranking
engine), the ranking algorithm's core mechanisms (recency decay, diversity
constraint, content similarity, UCB1 bandit, negative signal), the 20-persona
verification methodology, and the concrete numbers that came out of testing
it (e.g. the diversity constraint capping same-cuisine repeats at 2-of-5 vs.
5-of-5 unconstrained). No charting library — pure CSS/HTML, styled distinctly
from the leadership dashboard so the two don't read as the same document
reskinned.

## Data accuracy

Every number in both reports was computed from the app's actual mock data and
telemetry (`src/data/mockUsers.json`, `src/data/mockRecipes.json`, and
generated `culinaryfeed_events` telemetry) at the time of writing, not
estimated or invented. If the underlying mock data changes, these reports
will drift out of date and should be regenerated.

## Viewing

Open either file directly in a browser — no server required. Both are also
published as hosted, shareable pages; ask in the Claude conversation that
generated them for the current links.
