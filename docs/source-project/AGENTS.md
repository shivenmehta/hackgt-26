# HackGT 2026

## Project status

The `chore/app-setup` branch establishes the shared application foundation for
an affordable food planner. The app currently contains a starter page and a
health Route Handler, not meal planning or payment functionality.
Remote: `https://github.com/shivenmehta/hackgt-2026.git`.
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
- Supabase JavaScript and SSR packages installed; no database or auth connected yet.
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
No automated behavioral test suite is configured yet.
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

The 100-record starter catalog is in `data/usda/foundation/`, indexed by
`data/usda/foundation-manifest.json`. Read `data/usda/README.md` before using it.
All catalog records are Foundation abridged responses; nutrient identifiers use
`food.foodNutrients[].number`. Preparation states and unknown values matter.
Existing experimental JSON files outside that directory are not catalog entries.
The get-food script supports `<fdcId> <output-file> <display-name>` arguments.

Twelve catalog wrappers include `nutritionFallbacks.energy` sourced from SR Legacy.
These are labeled estimates with provenance; preserve the original Foundation
`food.foodNutrients` and read the match notes before using fallback values.
