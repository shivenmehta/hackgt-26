# Bridge weekly planner

The current planner is connected to the backend pipeline described in
[MEAL_PLANNER.md](docs/MEAL_PLANNER.md). Follow that guide for credentials,
Python setup, database configuration, deployment, and tests.

The form collects a weekly budget, US ZIP code, household size, dietary/allergen
restrictions, age, BMI, notes, and nutrition preferences. A searchable dropdown
covers all 21 catalog cuisines. It plans three meals daily. Only a one-person
household sees an editable calorie target; age/BMI do not automatically set it.

Build my week starts a durable job and displays progress. The browser can resume
it after refresh. Recipes come from MealDB; nutrition, yields, and some prices
are model estimates. Kroger prices are location-specific where available, with
explicit reference-store and model-price fallbacks. Costs represent consumed
ingredients, not checkout package totals. Image generation runs after the week
is ready and never blocks the plan.

The Monday–Sunday calendar uses meal-slot colors and labels. Mobile uses a day
selector. Meal dialogs show scaled ingredients, original recipe instructions,
per-person and household nutrition, price provenance, and alternatives from saved
rankings. Check product labels for allergens; recipe classifications are not
verified product certifications.

Bridge keeps its white/deep-blue/green/yellow palette and locally served Bricolage
Grotesque and Source Sans 3 fonts. The existing Community flow remains available.
The old sample adapter is retained only for isolated regression fixtures; the
live UI no longer calls it.

Run `npm run test:bridge` after building for mocked-provider browser tests.
Screenshots live in `test-results/playwright-bridge/`. Live checks additionally
require server credentials and the Python service.
