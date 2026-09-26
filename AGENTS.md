# HackGT 2026

## Project status

This repository's `main` contains dependencies and Markdown documentation copied
from the existing pre-event HackGT 2026 project. Preserve that provenance.
Remote: `https://github.com/shivenmehta/hackgt-26.git`.
No app source, USDA scripts, catalog JSON, or credentials have been copied.
Confirm event rules before reusing pre-event materials in a submission.
Original documentation is retained under docs/source-project as historical context.

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
- Planned backend: Next.js Route Handlers; none exist in this checkout.
- Supabase JavaScript and SSR packages installed; no database or auth connected yet.
- Node.js 24 and npm 11; use `.nvmrc` and commit `package-lock.json`.
- ESLint/Next.js rules, Prettier, and TypeScript dependencies are installed;
  only Prettier is configured in this dependency-only checkout.
- When adding dev/build scripts, use Webpack as in the source setup to avoid
  the documented Emotion/Turbopack hydration issue.

## How to install dependencies

Use Node.js 24 and npm 11. Run `npm ci` from the repository root.
Run `npm run format:check` to check formatting or `npm run format` to format.
No app exists yet, so dev, build, lint, typecheck, and USDA experiment commands
are not currently configured. Add the relevant source and configuration before
adding those commands. Preserve server-only credentials and never commit secrets.

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

## Ingredient catalog reference

`data/usda/README.md` describes the source project's catalog. The JSON catalog,
manifest, fallback data, and API scripts have not been copied here. Do not claim
they are available locally. Preserve preparation states, unknown nutrition values,
and provenance if catalog data is imported later.
