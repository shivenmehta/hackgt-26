# Combined MealDB + USDA nutrition catalog

This is a local JSON database: `meals.json` preserves all 300 original MealDB
recipes and replaces their `nutrition: null` field with calculated nutrition.
The original MealDB and USDA catalogs remain unchanged. No Supabase import,
Grok call, frontend integration, or runtime USDA call is required.

## Rebuild and query

```sh
npm run meals:nutrition
npm run test:nutrition
```

The build is deterministic and offline, using the cached records and editable
matching rules here. From Node/server code, import `getEnrichedMeals` from
`src/lib/meals/enriched-catalog.ts`; it accepts the same cuisine, diet, mealType,
and query filters as the base catalog.

## What the numbers mean

Nutrition is **for the entire recipe**, not one serving. `perServing` remains
null because recipe yields have not been reviewed. For each ingredient:

`nutrient amount = USDA nutrient per 100 g × ingredient grams / 100`

We calculate calories (kcal), protein (g), and fat (g). Explicit masses are
converted to grams. Compatible USDA household portions convert cups, spoons,
and some counted ingredients. Volume scaling assumes US customary units.
Where conversion is unresolved, the requested fallback is **100 g for the whole
ingredient line**, not 100 g per cup/jar/piece. This is a placeholder, not a
validated density or package size; it also applies to vague amounts such as
“to taste,” which can substantially distort totals. All such lines carry
`quantity.method: "assumed-100g"` and an explanation.

- `totals`: a nutrient total only when every ingredient contributes that nutrient;
  otherwise null. Complete coverage does not mean an accurate or verified recipe.
- `estimatedSubtotal`: sum of available contributions, including 100 g assumptions.
- `knownSubtotal`: excludes assumed-100g quantities; food matches can still be proxies.
- `coverage`: ingredient and nutrient counts, missing values, and fallback counts.
- `ingredients`: original measures, selected USDA IDs, match notes, conversion
  method, nutrient contributions, and source provenance.
- `status`: calculated-estimate, assumed-quantities, or partial. Partial takes
  precedence when both missing values and quantity assumptions occur.

Current build: 300 recipes / 3,266 ingredient lines; 2,939 matched lines;
1,836 sourced/mass conversions; 1,100 quantity placeholders; 3 matched lines
with incompatible preparation. There are 12 calculated-estimate recipes,
98 assumed-quantities recipes, and 190 partial recipes. See `report.json` for
unresolved ingredients and input SHA-256 hashes.

Do not treat missing values as zero. No cooking-loss, frying absorption,
discarded-liquid, or unlisted-ingredient adjustment is applied. Preparation and
food-variety assumptions require review before using these for nutrition targets.

## Sources and maintenance

- `ingredient-matches.json`: local USDA aliases, including labeled approximations.
- `external-matches.json`: additional USDA selections and rejected/unresolved matches.
  `search-candidate` matches remain provisional; they are not verified equivalents.
- `usda-searches.json`: cached API search candidates and retrieval metadata.
- `usda-foods/`: full supplementary USDA Foundation/SR Legacy records obtained
  through the USDA API, with source metadata. No credentials are stored.
- `usda-portions.json` and `portion-proxies.json`: original Foundation portions
  and separately identified SR Legacy household-weight proxies.
- `nutrient-proxies.json`: separately sourced foods used only to fill absent
  nutrients; existing native values, including zero, remain intact. Output
  `nutrientProvenance` identifies each supplemented value. Existing original
  energy fallback metadata is retained in `calorieProvenance`.

Searches and downloads were performed during preparation. The builder does not
search automatically: new ingredients need an accepted alias or cached USDA
record before rebuilding. Use the repository USDA search/get scripts to retrieve
additional candidates with `USDA_API_KEY` in `.env.local`, review food identity
and raw/cooked state, then update these rules and rebuild. Never commit API keys.
USDA data is per 100 g edible portion; a cup or jar is not universally 100 g.
See [USDA Foundation documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/).

This catalog retains TheMealDB attribution and recipe links. Pricing remains
null. Precalculation avoids repeated API calls and gives consistent, inspectable
results; the optional [Grok calorie pass](GROK.md) now adds separately labeled model
estimates for unresolved ingredient calories in the 190 partial recipes.

See [Grok calorie estimates](GROK.md) for the generated `meals-grok.json`, cache,
server-side loader, and `npm run meals:grok` commands.
