# HackGT 2026

## Project status

The `main` branch contains the shared application foundation for an affordable
food planner: a starter page, Chakra provider, health Route Handler, manual USDA
scripts, and a curated USDA ingredient catalog. Meal planning, authentication,
and payments are not implemented.
Remote: `https://github.com/shivenmehta/hackgt-26.git`.
The foundation and preparation materials were imported from `hackgt-2026`;
creating this repository does not change their original preparation dates.
Confirm event rules before reusing pre-event code in a submission.

## Product and hackathon context

- Read `PROJECT_CONTEXT.md` for the current idea, intended audience, selected
  track/challenge, and proposed scope. These are plans, not implemented features.
- The team is targeting **A Marina's Mission**, the Aramco Americas social-good
  track, and **Visa: Reimagine Shopping with Generative AI**, a sponsor challenge.
  Marina's Mission is the single chosen event track; Visa is an additional challenge.
- The idea is an affordable food planner for people with constrained or moderate
  budgets: suggest nutritious groceries, meals, and restaurant options around
  food budget, cuisine preferences, dietary restrictions, and practical needs.
- Read `EVENT_PACKET.md` for summarized requirements and
  `EVENT_PACKET_SOURCE.md` for the September 24, 2026 retrieved packet text.
  The snapshot has known coverage gaps and schedule inconsistencies.
- Visa calls for generative-AI commerce and secure, trusted payments. Neither an
  optimization algorithm alone nor a mock checkout establishes full compliance.
  Verify sponsor integration expectations and pre-event-code rules with organizers.
- Social/Meta functionality is a possible later extension, not a selected
  challenge or requirement for the current scope.

## Tech stack

- Next.js 16 App Router with React 19 and strict TypeScript.
- Chakra UI 3 with Emotion; no Tailwind installation.
- Next.js Route Handlers for backend endpoints.
- Supabase JavaScript and SSR packages installed; Python reads the Supabase foods catalog; app auth is not connected.
- Python 3.10+ for the standalone nutrient matcher and OSM location lookup; standard library only.
- Node.js 24 and npm 11; use `.nvmrc` and commit `package-lock.json`.
- ESLint with Next.js rules, Prettier, and TypeScript checks.
- Webpack dev/build scripts avoid the Emotion/Turbopack hydration issue documented
  in Chakra's Next.js guide.

## How to run the project

From the repository root, run `npm ci`, then `npm run dev`.
Open http://localhost:3000. The starter requires no credentials.
`GET /api/health` returns `{ "status": "ok" }`.
Run `npm run lint`, `npm run typecheck`, `npm run format:check`, and
`npm run build` for validation. After building, `npm start` serves production.
Use `npm run format` to format files and `npm run lint:fix` for lint fixes.
Run `python -m unittest discover -s tests -p "test_*.py" -v` for offline nutrition, Supabase-loader, and location tests.
For the standalone manual USDA experiment, set `USDA_API_KEY` in `.env.local`
and run `npm run test:usda`. This calls the real API and prints food data;
it is not an automated test or part of the application flow.
See `scripts/README.md` for per-request examples and `test:usda:*` commands
covering every food request method and both specification endpoints.

When connecting services, copy `.env.example` to `.env.local` and replace the
placeholders. USDA keys stay server-only. Supabase publishable keys may be public,
but data access needs Row Level Security policies. Never expose secret/service-role
keys in client code. Supabase session refresh and authentication are not wired yet.

## Conventions for project work

- Keep `main` runnable once application code exists. Work on short feature
  branches and merge focused pull requests after teammate review.
- Use `codex/` as the prefix for branches created by coding agents.
- Commit the chosen package manager's lockfile once dependencies are added.
- Inspect the current files before making changes; keep documentation aligned
  with the implementation.
- Follow the patterns and tooling established by the project as code is added.
  Use `src/app` for pages and Route Handlers, and `src/components` for UI.
  Use the `@/*` alias for `src/*`; keep credentials and external API calls server-side.
- Keep changes focused on the requested task.
- Do not commit credentials, tokens, or local secrets. Document required
  configuration with safe placeholders.
- Verify changes with the relevant checks when tooling exists. Report checks
  that could not be run and why; do not imply missing checks passed.
- Update this file whenever the stack, setup steps, run commands, or project
  conventions change.

## Ingredient catalog

The 300-record catalog is in `data/usda/foundation/`, indexed by
`data/usda/foundation-manifest.json`. Read `data/usda/README.md` before using it.
All catalog records are Foundation abridged responses; nutrient identifiers use
`food.foodNutrients[].number`. Preparation states and unknown values matter.
Existing experimental JSON files outside that directory are not catalog entries.
The get-food script supports `<fdcId> <output-file> <display-name>` arguments.

Twelve catalog wrappers include `nutritionFallbacks.energy` sourced from SR Legacy.
These are labeled estimates with provenance; preserve the original Foundation
`food.foodNutrients` and read the match notes before using fallback values.

## Local meal catalog

The 300-recipe MealDB catalog is in `data/mealdb/`. Read
[data/mealdb/README.md](data/mealdb/README.md) before using dietary fields or
enriching recipes. `npm run meals:query` searches locally; `npm run meals:build`
rebuilds offline; `npm run test:meals` checks catalog integrity and filters.
Use `src/lib/meals/catalog.ts` from Node/server code. Original MealDB categories
are not reliable dietary guarantees; positive diet filters require explicit
ingredient-screened flags. Nutrition, pricing, and servings remain unknown.

## Combined recipe nutrition

- Read `data/combined/README.md` before changing ingredient matching or conversions.
- `npm run meals:nutrition` rebuilds the separate local catalog offline;
  `npm run test:nutrition` verifies conversions, missing-value handling, and preservation.
- Preserve original MealDB/USDA data. Keep unresolved nutrients null and label
  100 g fallback quantities. Totals are whole-recipe, not per-serving.
- USDA proxy IDs and input hashes must remain traceable; do not overwrite sourced
  nutrition or claim partial sums are complete totals.
- The user-authorized Grok calorie pass is documented in `data/combined/GROK.md`.
  `npm run meals:grok` generates/resumes estimates with a server-only `XAI_API_KEY`
  or `GROK_API_KEY`; `--dry-run` makes no calls and `--offline` uses only cache.
  `npm run test:grok` verifies targeting, validation, source preservation, and totals.
  Keep Grok values explicitly labeled in `nutrition.grokCalories`; protein/fat
  and original USDA calculations remain unchanged.

- `npm run meals:summary` exports compact JSON and a readable Markdown nutrition
  table from the Grok catalog. Regenerate after changing nutrition data; no API calls.

- `npm run meals:grok:full` estimates whole-recipe calories/protein/fat for every
  original MealDB recipe, using only recipe text. Output: `data/grok/meals.json`;
  cache: `data/grok/cache`. Supports `--dry-run`, `--limit N`, and `--offline`.
  `npm run test:grok:full` validates this independent estimator.
- Compact summaries intentionally omit `usdaEstimatedSubtotal`; its blanket
  100 g placeholders are unsuitable for comparing meal nutrition. Historical
  detailed USDA artifacts retain provenance and have not been overwritten.

- Grok data now lives in `data/ grok_calorie_estimates/` (leading space in folder name).
  `npm run meals:grok:fiber` adds total carbohydrates (`carbsG`, including fiber)
  and dietary fiber (`fiberG`) using earlier ingredient assumptions; existing
  calories/protein/fat are preserved. Supports dry-run, limit and offline flags.
  `npm run test:grok:fiber` checks validation and aggregation. Cache is `fiber-cache/`.

- `npm run meals:grok:best-effort` creates the separate `data/grok-best-effort/meals.json`
  from MealDB-only inputs (no USDA). Grok estimates numeric calories/protein/fat/
  total carbs/fiber for every ingredient; quantity assumptions are recorded in cache.
  Supports dry-run, limit and offline flags; `npm run test:grok:best-effort` validates it.
  Successful totals must be complete; request failures remain pending, never zero.

## Nutrient matching

`src/lib/nutrition/knn.py` implements nutrient nearest-neighbor ranking; see its
README for units, limits, missing data, and scientific scope. `catalog.py` loads
only manifest-listed foods. Targets describe one portion, not daily requirements.
Dietary compatibility requires caller-verified metadata; no allergy inference.

Run `python -m src.lib.nutrition.example` for editable example targets. The Python
matcher is standalone and is not called by the Next.js app.

The read-only Python Supabase loader is `src/lib/nutrition/supabase_catalog.py`.
Run `python -m src.lib.nutrition.test_supabase` with the URL and publishable key
in `.env.local` for live checks. Food snapshots and reports go in gitignored
`test-results/`. It reads original `source_record` nutrients, not the SQL calorie
column; the documented energy-method preferences differ. No database writes.

## OSM food access

`src/lib/location/overpass.py` queries nearby retail and food-assistance places
through read-only Overpass requests. No API key is required. See the location
README for the CLI and JSON contract. Example:
`python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963 --radius-m 5000`.
The demo coordinates are near Georgia Tech. Cache data is stored in gitignored
`test-results/osm-cache.sqlite3` with a 24-hour TTL. Distances are straight-line,
not routes. Preserve OSM attribution and do not infer store inventory, pricing,
SNAP participation or pantry eligibility. Nutrition KNN remains separate; no
hosted location database is provisioned; the local Next.js Community UI is connected.

OSM results also include `alternative_food_retail` (farm shops/marketplaces)
and `potential_assistance` (community centres without explicit food tags). Do
not treat potential contacts as confirmed food providers. Food-bank/soup-kitchen
subtags match even without `amenity=social_facility`; tagging gaps are recorded.

## SNAP retailer lookup

`src/lib/location/snap.py` imports the current USDA retailer CSV into local SQLite
with standard-library CSV parsing; no pandas/API key is required. Import with
`python -m src.lib.location.snap --csv test-results/snap-retailers.csv`, then add
`--sources osm snap` (or `--sources snap`) to the nearby CLI. CSV and SQLite files
remain gitignored in `test-results/`. Refresh SNAP by downloading and reimporting
the CURRENT export; historical authorization files are not supported. Preserve
retrieval dates and source IDs. SNAP retailers are purchasable-food options, not
free-food assistance. Raw OSM and SNAP lists are retained; canonical locations use conservative deduplication. SNAP acceptance is reported from the snapshot, not live-verified.

## Feedam assistance and location reconciliation

Add `feedam` to the nearby CLI `--sources` to query `/api/resources/nearby` and
`/api/resources/urgent`. This is Feed America (feedam.org), not Feeding America.
No API key; fresh read-only calls, no urgent cache. Retain attribution and original
record data_source. Provider open/urgent claims are not independently verified.
The canonical `locations` list feeds the two-category display contract. `deduplicate.py` merges
source IDs and strict name/address/proximity matches, preserves every source
record, and flags uncertain duplicates instead of hiding them. Raw lists remain
for auditing. Endpoint failures and potentially capped results must stay visible.

UI output: `ui_categories.general_food_resources` and
`ui_categories.snap_and_assistance` contain disjoint distance-sorted canonical
locations. Preserve `service_labels` so paid SNAP retail and unverified potential
contacts are not presented as confirmed free food. `output.py` owns this grouping.

## Local community giveaways and availability

`src/lib/location/events.py` persists community food posts in gitignored
`.local/community-events.sqlite3`; no dependencies beyond the standard library.
Use `python -m src.lib.location.events create --input PATH` for validated event JSON,
`geocode ADDRESS` for US Census candidate pins, and `cancel EVENT_ID` with the
private creation token. Public location consent and explicit offset-bearing start
and end times are required. Tokens never belong in search results or git.
The Community frontend now connects through the Next.js location proxy and private Python service. Event management uses capability links without accounts.

Nearby defaults to `osm events`; use `--sources osm snap feedam events` for all.
Event searches default to active/upcoming within 24 hours; `--at` and
`--event-window-hours` affect community events only. Canceled/ended events are
excluded. Distinct events at the same venue must not merge with each other or stores.
All canonical/UI records carry `availability`; preserve source schedules and unknown
hours (particularly SNAP). External hours are not verified open-now predictions.
See the location README for the schema and deployment limits. Run
`python -m src.lib.location.event_examples --output test-results/community-event-examples.json`
for 20 synthetic scenarios across five cities, isolated from the persistent store.

## Community web development

`npm run dev` starts Next.js plus the private Python location service through
`scripts/dev-location.mjs`. Ctrl+C stops both. `npm run dev:web` runs only Next.js.
Python 3.10+ is required; configure `PYTHON_COMMAND` if needed. The launcher reads
`.env.local` and generates a private service token for local use. `npm run start:local`
starts both services after a production build; `npm start` remains Next.js only.
See `src/lib/location/README.md` for deployment/storage requirements.

Frontend files are isolated under `src/components/location/` and
`src/app/community/`; `src/app/location.css` supplies responsive styling.
Leaflet renders the client-only map. Preserve OSM attribution and tile usage rules.
The `/api/location/[...path]` server proxy restricts operations and same-origin writes.
The Python HTTP adapter is loopback-only with a private server token; do not expose
it directly to the internet. Account-free hosting deliberately uses separate public
event links and private cancellation capabilities. Never log/store private tokens
in public URLs, result records, or committed fixtures. The private fragment is
removed from the address bar and kept only in per-tab session storage.

Run `npm run test:location-ui` after building for isolated browser integration tests
on ports 3101/8766; `npm run test:bridge` tests planner regressions on 3100.
The browser tests use Chrome and their own event database under `test-results/`.

Browser output directories must stay under `test-results/playwright-bridge` and
`test-results/playwright-location`, never the whole `test-results` directory:
Playwright clears its output directory, while sibling files include SNAP data and
provider snapshots. Event test databases are isolated from `.local` host posts.

Community location search uses `address-autocomplete.tsx` and the `/suggest` proxy endpoint backed by `autocomplete.py` (Photon/OSM). Preserve debounce, stale-response protection, attribution, and selection invalidation. Host address confirmation remains Census-based. Configure `LOCATION_AUTOCOMPLETE_URL` for a private Photon endpoint at higher traffic.
