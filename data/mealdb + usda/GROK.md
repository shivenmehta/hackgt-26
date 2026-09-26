# Grok calorie estimates

The Grok pass targets ingredient lines with missing calories or an assumed-100g
quantity **inside the 190 partial recipes**. The other 110 recipes are unchanged;
98 of those still contain quantity placeholders. Protein and fat are unchanged
throughout this pass and may remain partial or use different quantity assumptions.

## Run

Set `XAI_API_KEY` (or the existing `GROK_API_KEY`) in `.env.local`. Never put it in
client code or prefix it with `NEXT_PUBLIC_`. `GROK_MODEL` optionally overrides
`grok-4.20-0309-non-reasoning`. No additional dependencies are required.

```sh
npm run meals:grok -- --dry-run  # count targets; no paid calls
npm run meals:grok -- --limit 1 # at most one new recipe request
npm run meals:grok              # process/resume all remaining targets
npm run meals:grok -- --offline # rebuild only from valid local cache; no API key needed
npm run test:grok
```

Live runs send recipe names, ingredients, instructions, and existing calorie/weight
values to xAI. They use API credits. Three requests run concurrently; transient
HTTP failures receive bounded retries. Each successful response is saved before
the next request. Completed responses that leave a field null are also cached;
rerunning does not automatically pay to ask the same question again. Review those
entries or intentionally invalidate their cache to retry. A failed request stops scheduling further work; already in-flight
requests finish and the partial output is saved. Rerun to resume. A lock prevents
concurrent writers; remove `.grok-enrichment.lock` only after confirming a crashed
run is no longer active.

## Output and application access

- `meals-grok.json`: all 300 original enriched recipes, plus
  `nutrition.grokCalories` on the 190 partial recipes. Other recipes have null.
- `grok-report.json`: completed calorie estimates, remaining gaps, and source hash.
- `grok-cache/*.json`: estimates by recipe/input/model/prompt hash, with model,
  timestamp, and per-ingredient assumptions. These contain public recipe data,
  not credentials. Changing the model or relevant input invalidates that cache.

```ts
import { getGrokEnrichedMeals } from "@/lib/meals/enriched-catalog";

const meals = await getGrokEnrichedMeals(); // Node/server only
const meal = meals.find((m) => m.nutrition.grokCalories !== null);
const calories = meal?.nutrition.grokCalories;
console.log(calories?.totalCaloriesKcal); // whole recipe; null if still incomplete
console.log(calories?.estimatedSubtotalKcal); // available contributions only
console.log(calories?.ingredients); // per-line values, source labels, assumptions
```

Original `nutrition.totals`, `knownSubtotal`, `estimatedSubtotal`, ingredients,
and USDA provenance remain unchanged. Use the explicitly labeled `grokCalories`
fields when displaying these model-assisted estimates; do not combine a partial
subtotal with the entire new total, which would double-count ingredients.
The loader rejects stale output if the base catalog changed. Rebuild offline to
apply still-valid cached entries, then run online to fill invalidated entries.

## Calculation and limits

For each targeted ingredient, the model estimates missing edible grams and/or
calories per 100 g. Sourced quantities and USDA calorie densities take precedence
over the model. Locally computed calories equal grams × kcal per 100 g / 100.
The model cannot overwrite existing non-target calorie contributions. Responses
are checked for exact ingredient positions, finite nonnegative numbers, broad
bounds, and explanations. Validation rejects malformed output; it does **not**
verify nutritional accuracy. Model uncertainty can leave a field null, which
keeps the full calorie total null rather than silently counting it as zero.

These are **unverified model estimates**. Quantity assumptions can still be wrong.
No per-serving values, nutrition targets, protein/fat backfill, frontend wiring,
or correction of ingredients omitted by MealDB is included. The original catalog
can still be rebuilt offline with `npm run meals:nutrition`.

API integration follows [xAI structured outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs).

## Compact summary

Run `npm run meals:summary` to generate [meals-summary.md](meals-summary.md)
(one row per recipe) and [meals-summary.json](meals-summary.json). These show
USDA known subtotals, available totals, and the Grok calorie overlay.
The placeholder-based `usdaEstimatedSubtotal` has been removed from summaries.
USDA totals are also hidden when any 100 g placeholder quantities remain.
`isFullyUsdaCalculated` means complete USDA-based totals without 100 g placeholders,
not perfect accuracy; proxies may remain. `hasGrokEstimate` means at least one
successful ingredient estimate, not necessarily a complete Grok calorie total.
Original detailed catalogs remain unchanged. Regenerate after enrichment updates.
