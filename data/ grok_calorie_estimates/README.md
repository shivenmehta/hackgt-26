# Independent Grok meal nutrition estimates

`npm run meals:grok:full` reads all recipes from **data/mealdb/meals.json** and
estimates calories (kcal), protein (g), and fat (g) for the whole recipe.
It sends recipe ingredients, measures, name, cuisine, and instructions to Grok.
No USDA records, previous nutrition estimates, or blanket 100 g conversions are
used. The model estimates ingredient contributions; local code adds them up.

```sh
npm run meals:grok:full -- --dry-run # preview counts, no paid API calls
npm run meals:grok:full -- --limit 1 # test one uncached recipe
npm run meals:grok:full             # all remaining recipes; uses API credits
npm run meals:grok:full -- --offline # regenerate using cache only
npm run test:grok:full
```

Use the server-only `GROK_API_KEY` or `XAI_API_KEY` in `.env.local`.
`GROK_MODEL` overrides the default `grok-4.20-0309-non-reasoning`.
Successful calls are cached by recipe, model and prompt version. Reruns resume;
recipe/model changes trigger fresh estimates. Three requests run concurrently,
with bounded retries for transient HTTP errors. A failed request stops new work,
preserves completed cache entries, and exits nonzero after saving partial output.
Null estimates are cached as completed responses, not automatically retried.

`meals.json` contains compact entries with id, name, cuisine, caloriesKcal,
proteinG, fatG, status, source/model/date, missing-nutrient counts, and a cache
link. `report.json` provides progress counts. `cache/` contains per-ingredient
contributions and assumptions for review. Pending meals have null nutrition;
partial meals retain null for any nutrient missing one or more contributions.
There are no partial sums presented as full recipe totals.

All values are **unverified model approximations for the entire recipe**, not
per-serving nutrition. Quantity assumptions can be wrong; numeric/shape validation
does not establish accuracy. Recipe yields are not invented. Existing combined
USDA and earlier calorie-only Grok artifacts are preserved for comparison.
This script is separate from meal-plan generation and is run manually.

## Fiber and carbohydrates

`npm run meals:grok:fiber` adds whole-recipe `carbsG` (total carbohydrate,
including fiber) and `fiberG` to this folder's `meals.json`. Existing calories,
protein and fat remain unchanged. `fiberCarbsEstimate` records the model, date,
status and ingredient-assumption cache link. `fiber-report.json` counts this pass
separately; existing `report.json` describes the original macro pass.

Supports `--dry-run`, `--limit 1`, and `--offline`. Uses server-only XAI_API_KEY
or GROK_API_KEY and API credits. Completed requests are cached in `fiber-cache/`.
The model receives previous ingredient estimates to reuse quantity assumptions.
Fiber is included in carbs, not added on top. Unknowns remain null; zero is valid.
Whole-recipe model approximations are not verified measurements or per-serving values.
Macro rebuilds retain supplements when the original macro cache has not changed;
rerun the fiber command after changing recipes or macro assumptions.

If Grok returns fiber greater than total carbs, both values for that ingredient
are discarded as unknown and the reason is retained in its cached assumptions.
Other valid ingredients are retained; no silent arithmetic correction is made.
