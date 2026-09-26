# HackGT 2026

A two-person food-planning project for HackGT 13.
Repository: https://github.com/shivenmehta/hackgt-26.

The shared foundation and preparation materials were imported from `hackgt-2026`.
Original documentation snapshots are in `docs/source-project/`. Their previous
setup instructions describe the source repository; this README describes the
current checkout.

## Stack

Next.js 16 App Router, React 19, TypeScript, Chakra UI 3, and Next.js Route
Handlers. Supabase client and SSR dependencies are installed for future database
and authentication work. ESLint and Prettier provide shared code checks.

## Getting started

Use Node.js 24 (`nvm use` if you use nvm) and npm 11. npm ships with Node;
there is no need to install it as an application dependency.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The starter works without external credentials.
The health endpoint at `/api/health` returns `{ "status": "ok" }`.

Before connecting services, copy `.env.example` to `.env.local` and fill in
Supabase's project URL/publishable key and your server-only USDA API key.
Never commit `.env.local` or private keys. Installing Supabase packages does not
create a hosted project: database tables, Row Level Security, login, and SSR
session refresh still need to be implemented before user data is stored.

## Commands

| Command                | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Start development server                  |
| `npm run lint`         | ESLint; warnings fail the check           |
| `npm run lint:fix`     | Apply available lint fixes                |
| `npm run typecheck`    | Generate route types and check TypeScript |
| `npm run format`       | Format project files                      |
| `npm run format:check` | Check formatting                          |
| `npm run build`        | Build production app                      |
| `npm start`            | Serve the production build                |

No behavioral test suite is configured yet. Run the four checks (lint,
typecheck, format:check, build) before opening a PR.
ESLint stays on major 9 because the React plugins bundled with the current
Next.js lint config do not support ESLint 10 yet. npm flags ESLint 9 as deprecated;
upgrade when those plugins support the newer API.
Dev and build use Webpack because Chakra documents a possible Emotion hydration
issue with Turbopack. See [Chakra setup](https://chakra-ui.com/docs/get-started/frameworks/next-app).

## Manual USDA API experiment

Set `USDA_API_KEY` in your ignored `.env.local`, then run:

```bash
npm run test:usda
```

The original `scripts/usda-api-testing.ts` is a search scratchpad. See
[scripts/README.md](scripts/README.md) for separate examples covering all seven
food request methods plus the JSON and YAML specification endpoints. For example:

```bash
npm run test:usda:get-foods-search
npm run test:usda:post-foods-list
```

These commands make real API requests. The get-food script can save a JSON file;
other commands print results. See the script documentation before refreshing data.

## Ingredient data

The catalog contains 100 reviewed ingredients retrieved through USDA FoodData
Central API calls. Records preserve `fetchedAt`, source FDC IDs, response data,
and provenance for separately sourced calorie estimates. See
[data/usda/README.md](data/usda/README.md) for preparation states, missing nutrients,
and the 12 labeled SR Legacy energy fallbacks. This setup did not refetch records
or alter their retrieval timestamps. The catalog is not yet connected to the app.

## Project layout

- `src/app`: pages, root layout, and API Route Handlers.
- `src/components/ui/provider.tsx`: shared Chakra provider.
- `@/*`: import alias for `src/*`.
- `.env.example`: safe configuration placeholders.
- `AGENTS.md`: project conventions for coding agents.

## Collaboration

Create focused branches from the latest `main`; merge through teammate-reviewed
pull requests. Commit `package.json` and `package-lock.json` together. After
pulling dependency changes, run `npm ci`. Keep API experiments in separate branches.

## Event reference

- [Current idea and chosen tracks](PROJECT_CONTEXT.md): affordable food planning,
  A Marina's Mission social-good track, and the Visa generative-AI commerce challenge.
- [Event packet summary](EVENT_PACKET.md): requirements, schedule, and unresolved details.
- [Retrieved packet text](EVENT_PACKET_SOURCE.md): September 24 snapshot with documented coverage gaps.

[HackGT 13 pre-event packet](https://hexlabs.notion.site/HackGT-13-Pre-Event-Packet-cf10438064318246b668017b1b3030e4)

Confirm event rules on advance preparation before reusing code in a submission.

## Bridge weekly planner

The frontend now includes an interactive sample meal planner. See [BRIDGE.md](BRIDGE.md)
for the demo flow, design, limitations, and validation commands.

## Local meal catalog

The 300-recipe MealDB catalog is in `data/mealdb/`. Read
[data/mealdb/README.md](data/mealdb/README.md) before using dietary fields or
enriching recipes. `npm run meals:query` searches locally; `npm run meals:build`
rebuilds offline; `npm run test:meals` checks catalog integrity and filters.
Use `src/lib/meals/catalog.ts` from Node/server code. Original MealDB categories
are not reliable dietary guarantees; positive diet filters require explicit
ingredient-screened flags. Nutrition, pricing, and servings remain unknown.

## Precalculated recipe nutrition

The separate [combined catalog](data/combined/README.md) adds USDA-based
whole-recipe calories, protein, and fat to all 300 recipes, with partial coverage
and explicit 100 g quantity placeholders where needed. The base MealDB catalog
keeps its original null nutrition fields. Rebuild with `npm run meals:nutrition`
and verify with `npm run test:nutrition`.

Optional [Grok calorie enrichment](data/combined/GROK.md) fills calorie/quantity
gaps in the 190 partial recipes, retaining original USDA values. Run
`npm run meals:grok -- --dry-run` to preview or `npm run meals:grok` to resume.
