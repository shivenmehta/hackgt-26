# MealDB-only best-effort Grok nutrition

This separate comparison dataset uses **only MealDB recipe ingredients, quantities,
name, cuisine, and instructions**. No USDA data or earlier estimates are supplied.

```sh
npm run meals:grok:best-effort -- --dry-run
npm run meals:grok:best-effort -- --limit 1
npm run meals:grok:best-effort
npm run meals:grok:best-effort -- --offline
npm run test:grok:best-effort
```

Live runs use API credits through server-only `GROK_API_KEY` or `XAI_API_KEY` in
`.env.local`. The model is configurable via `GROK_MODEL`. Three concurrent
requests process all 300 recipes; completed responses are cached and reused.
`--limit 1` caps new recipe requests; `--offline` never calls the API.

`meals.json` contains compact, whole-recipe `caloriesKcal`, `proteinG`, `fatG`,
`carbsG` (total carbohydrates including fiber), and `fiberG`, plus source/model/date,
status and a cache link. `report.json` records completed and pending counts.
`cache/` contains input recipe context, ingredient assumptions, edible grams,
per-100g estimates, and calculated ingredient contributions.

Grok must estimate every quantity and all five nutrient densities numerically.
For ambiguous measures it should assume reasonable package sizes, ingredient
weights and recipe-specific amounts; it must not use a blanket 100 g fallback
or zero solely because a value is unknown. Local code multiplies grams by the
estimated density and sums the ingredient contributions. Successful recipe
records have all five numeric totals. Recipe yield is not invented: these are
not per-serving values. They remain **unverified best-effort model estimates**.

A malformed/refused response, invalid nutrient pair or API failure is not a
valid estimate. The run stops scheduling new work, saves completed results,
leaves unfinished recipes `pending` with null nutrients, and exits nonzero.
Rerun to resume; HTTP rate-limit/server failures receive bounded retries.
Cache keys include model, prompt version and full recipe input.
Existing Grok, USDA and MealDB datasets are not modified. Running this script
is separate from the future meal-plan generation workflow.
