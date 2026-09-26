# HackGT 26

Dependency and documentation setup imported from the existing
[HackGT 2026 repository](https://github.com/shivenmehta/hackgt-2026).
This transfer contains pre-event preparation; creating this repository does not
change when that material was originally prepared. Confirm reuse eligibility
with the organizers.

## Install

Use Node.js 24 and npm 11, then run `npm ci` from this directory.
The dependency declarations and package-lock.json match the source project.
Includes Next.js 16, React 19, Chakra UI 3, Emotion, Supabase, TypeScript,
ESLint, Prettier, and tsx. No Tailwind is installed.

## Scope

This repository currently contains dependencies and Markdown documentation only.
No application source, health endpoint, API experiment scripts, ingredient JSON
records, credentials, or environment files were copied. There is no runnable
application or build/typecheck command yet. Add those when creating the app.
Only `npm run format` and `npm run format:check` are currently configured.

## Documentation

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md): food planner idea and track choices.
- [PROJECT_PLAN.md](PROJECT_PLAN.md): editable implementation plan.
- [EVENT_PACKET.md](EVENT_PACKET.md): event requirements summary.
- [EVENT_PACKET_SOURCE.md](EVENT_PACKET_SOURCE.md): dated source snapshot.
- [scripts/README.md](scripts/README.md): reference for source-project API experiments.
- [data/usda/README.md](data/usda/README.md): reference for source-project catalog.
- [AGENTS.md](AGENTS.md): current repository conventions.
- [Original README](docs/source-project/README.md) and
  [original conventions](docs/source-project/AGENTS.md): source-project snapshots.

Descriptions of implemented features in imported reference documents apply to
the source project, not this dependency-only checkout.
