# Bridge local recipe catalog

300 real TheMealDB recipes, stored as JSON. No database server, credentials, or
network request is needed to read/filter the downloaded catalog. This is a local
read-only catalog, not a mutable SQL database. User accounts and saved plans are
separate future concerns.

## Contents

| Cuisine    | Recipes |
| ---------- | ------: |
| Mexican    |       6 |
| Indian     |      15 |
| Chinese    |      27 |
| American   |      34 |
| Italian    |      21 |
| Japanese   |       9 |
| Thai       |      16 |
| French     |      16 |
| Greek      |       8 |
| Turkish    |      16 |
| Moroccan   |       6 |
| Spanish    |      16 |
| British    |      16 |
| Vietnamese |      16 |
| Jamaican   |      16 |
| Canadian   |      15 |
| Egyptian   |       8 |
| Tunisian   |       8 |
| Polish     |      15 |
| Portuguese |       8 |
| Filipino   |       8 |

The first 100 recipes are preserved unchanged. This expansion adds 200 distinct
MealDB IDs, cycling through cuisine discovery results to spread additions across
available cuisines. Mexican, Indian, Chinese, and American filters returned no
additional IDs beyond our original selection. The catalog now spans 21 cuisines.
These are editorial starter selections, not a measured popularity ranking.
Desserts, sides, and snacks are included and labeled separately; these are not
300 complete main-course options. Provider area/country labels are preserved
without claiming culinary origin has been independently verified.

- `meals.json`: normalized application-ready recipe records.
- `manifest.json`: IDs, names, cuisine counts, retrieval dates, and dietary conflicts.
- `selection.json`: reproducible ID selection, editorial meal types, dietary
  screening notes, and source fingerprints.
- `raw/<id>.json`: original full API response plus retrieval timestamp; retains
  all source, image, licensing, and optional metadata.

Every normalized recipe has its ID, name, cuisine, original category, ingredients
paired with original measurements, full instructions, source/image/video URLs,
and source provenance. Blank quantities become `null`; duplicate ingredients and
source order remain intact. Source imperfections are preserved, not repaired by
inventing ingredients, measurements, servings, or directions.

## Use locally

```bash
npm run meals:query
npm run meals:query -- Indian vegan dinner
npm run meals:query -- American any breakfast
npm run meals:query -- Thai any dinner
npm run meals:build
npm run test:meals
```

From a Node script or server-side application code (run from repository root):

```ts
import { getMeals, getMeal } from "@/lib/meals/catalog";

const dinners = await getMeals({
  cuisine: "Indian",
  diet: "vegan",
  mealType: "dinner",
});
const recipe = await getMeal("52868");
console.log(recipe?.ingredients, recipe?.instructions);
```

The loader uses Node filesystem APIs. Do not import it into client components.
For deployment, ensure `data/mealdb/meals.json` is included in the server artifact;
the planner UI still uses its existing demo adapter and is not wired to this data.

## Dietary and meal-type filters

`sourceCategory` is MealDB's original category (Chicken, Pasta, Vegetarian, etc.).
`sourceDietLabels` only reflects provider category claims. It must not enforce user
restrictions: for example, Egg Drop Soup is categorized Vegetarian but lists
Chicken Stock. Chinese Tomato Egg Stir Fry and Sichuan Eggplant have similar
conflicts. All are excluded by our vegetarian filter.

`dietary.vegetarian` and `dietary.vegan` use three states:

- `true`: ingredient-list screening supports this diet; see notes.
- `false`: explicitly listed animal products contradict the diet.
- `null`: unresolved; never silently treat it as compatible.

Clear meat/fish/stock/gelatin ingredients are exclusions. Only selected recipes
with clear ingredient lists receive positive labels. Cheese/rennet, shortening,
marshmallows, compound sauces, pasta formulations, and incomplete ingredient lists
can leave suitability unresolved. These are limited ingredient screenings, not
allergen certifications or guarantees about every packaged product. No allergy
filter is implemented. Review original instructions and actual product labels
before enabling allergy-sensitive meal planning.

`mealTypes` are editorial suggestions: breakfast, lunch, dinner, dessert, side,
or snack. Source categories stay unchanged (e.g. Pancakes is a source Dessert,
but has an editorial breakfast tag). Lunch/dinner tags on side-like dishes do not
establish a nutritionally complete meal. Users of the catalog should explicitly
filter meal types rather than choose indiscriminately from all 300 records.

## Rebuild and refresh

`npm run meals:build` deterministically rebuilds normalized data and manifest from
the checked-in raw records without network access.

```bash
npm run meals:build -- --fetch   # download missing selected records
npm run meals:build -- --refresh # attempt to re-fetch all selected records
```

The importer uses the development key `1` unless `MEALDB_API_KEY` is set. It makes
sequential requests with a short delay, bounded timeouts, and bounded retries for
429/server errors. It validates IDs and full recipe content before saving. Outputs
are written via temporary files and rename; no full catalog is emitted unless all
selected records normalize successfully. Earlier raw downloads may remain after
a failed import, and are reused on a retry.

Source fingerprints deliberately stop a refresh if a recipe changed, so old diet
screening cannot silently approve new ingredients. Inspect the new source recipe,
update its selection annotations and SHA-256 fingerprint (`recipeFingerprint` in
`src/lib/meals/model.ts`), then refresh again. Do not blindly update fingerprints.

## Enrichment still needed

`servings`, `nutrition`, and `pricing` are `null`. Original measurements such as
"1 onion", "pinch", and "to serve" are not gram quantities. Grok/USDA matching,
portion review, Kroger pricing, and budget optimization are not implemented here.
No API calls to those services are needed to use this recipe catalog.

For future price fallback, the chosen reference store is Kroger location
`01100346`, 1715 Howell Mill Rd NW, Atlanta. Label its fallback values as Atlanta
reference-store estimates, not national averages. No prices were fetched here.

## Attribution and access

Recipe data and imagery: [TheMealDB](https://www.themealdb.com/).
Use each record's `source.mealUrl` and retain original publisher links/notices.
Images are referenced by URL, not downloaded or relicensed by this catalog.

Official [documentation](https://www.themealdb.com/documentation) supports key `1`
for development/education and directs public releases to supporter access.
[Terms](https://www.themealdb.com/terms_of_use.php) permit copying API content via
official endpoints subject to notices, attribution, and third-party content rights.
Raw licensing fields may be null; their absence is not a blanket license grant.
