# Bridge frontend demo

Run `npm ci`, then `npm run dev`. The weekly planner replaces the starter page.
The form collects budget, city/ZIP, household size, 1–6 meals per day, dietary
patterns, allergen exclusions, cuisine preferences, age, BMI, and optional notes.
“Use example preferences” fills fictional profile values for a quick walkthrough.

Submit to see Monday–Sunday of the current local week. Meal details show recipes,
scaled ingredient grams, illustrative per-serving nutrition, and estimated costs
of ingredients consumed. They are not checkout totals or live store quotes.
The sample adapter applies supported dietary and allergen tags before cuisine
preferences, repeats eligible recipes, and never relaxes restrictions to fill slots.
When no recipes match, edit preferences or expand the sample catalog. Allergens
are sample tags, not verified product labels. Age, BMI, location and free text do
not affect nutrition targets, prices, or meal selection in this demo.

All state stays in memory and resets on refresh. No profile data is sent to a
server, persisted, or parsed by an LLM. The Community tab is a coming-later page.
No Kroger, Supabase, medical targeting, or optimization integration is implemented.
The existing USDA catalog, SQL exports, API experiments, and database are unchanged.

## Structure and design

- `src/lib/planner.ts`: typed preferences/recipes/plans, form validation, and pure
  deterministic planner adapter; replace this adapter for a future backend.
- `src/lib/sample-recipes.ts`: 15 hand-authored example recipes. All ingredient
  prices and nutrition are illustrative, not derived from the USDA catalog.
- `src/components/bridge/`: client flow, meal dialog, and custom SVG plate artwork.
- `src/app/bridge.css`: white, deep blue, green, and yellow design system. The
  calendar uses color plus labels for meal slots; mobile uses a day selector.
- The local Bricolage Grotesque and Source Sans 3 fonts include their OFL licenses.

## Validation

Run `npm run test:planner`, `npm run lint`, `npm run typecheck`, and `npm run build`.
After building, run `npm run test:bridge` for desktop/mobile Chrome checks
(Google Chrome required). Screenshots are saved under `test-results/`.
Manually verify required-field focus, diet selection, budget overages, meal-dialog
keyboard focus/Escape, edit preservation, Community navigation, and refresh reset.
Check the setup and calendar at desktop and 390px mobile widths. No network
credentials are needed for this flow.
