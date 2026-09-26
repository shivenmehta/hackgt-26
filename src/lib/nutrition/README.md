# Nutrient nearest neighbors (Python)

Requires **Python 3.10+**, with no third-party packages or API key. This is a
standalone Python module; it is not wired into the Next.js application. It replaces
the earlier TypeScript matcher and uses Python snake_case names. USDA JSON files
and their field names remain unchanged.

From the repository root:

```sh
python -m src.lib.nutrition.example
python -m unittest discover -s tests -p "test_knn.py" -v
```

On Windows, use `py` instead of `python` if that is your installed launcher.
`example.py` contains editable illustrative targets. The loader locates the data
relative to its own file, so it does not depend on the working directory.

```python
from src.lib.nutrition.catalog import load_foundation_foods
from src.lib.nutrition.knn import find_nearest_foods

foods = load_foundation_foods()
result = find_nearest_foods(
    foods,
    targets={
        "protein": {"amount": 10, "mode": "min", "weight": 2},
        "fiber": {"amount": 3, "mode": "min"},
        "sodium": {"amount": 100, "mode": "max"},
    },
    k=5,
    portion_grams=100,
    limits={"sodium": {"max": 300}},
)
for food in result["matches"]:
    print(food["name"], food["distance"], food["nutrients"])
print(result["excluded"])
```

These numbers demonstrate the interface, not dietary recommendations. Targets and
hard limits describe ONE food at `portion_grams` (default 100 g), not a meal/day.

| Nutrient keys                                               | Units      |
| ----------------------------------------------------------- | ---------- |
| `protein`, `carbohydrates`, `fat`, `fiber`, `saturated_fat` | g          |
| `sodium`, `calcium`, `iron`, `potassium`                    | mg         |
| `vitamin_d`                                                 | micrograms |
| `energy`                                                    | kcal       |

## How it works

1. `catalog.py` loads the 300 manifest-listed Foundation records. It excludes the
   experimental brown-rice flour file and validates record identity and paths.
2. `extract_nutrients` reads `food.foodNutrients` using stable USDA nutrient numbers,
   names in the source, amounts, and units. Unknown values stay unknown.
3. `find_nearest_foods` scales each food to the requested portion, fits nutrient
   scales, applies hard restrictions, computes distances, and returns the nearest k.

Distance is `sqrt(sum(weight * (error / scale)^2) / sum(weight))`. Exact (`target`)
goals use ordinary differences; `min` penalizes shortfalls and `max` penalizes
excesses. The min/max extension is goal-aware ranking, not a symmetric metric.
Scales default to population standard deviations over known values in the full
input catalog before filtering. Constant features use `max(abs(mean), 1)` with a
warning. Positive per-goal `scale` overrides specify tolerances in the selected
portion's canonical units. Standard deviations are sensitive to outliers such as
salt and change if the catalog changes. Weights default to 1. Neither scales nor
weights represent clinically validated importance.

Only requested nutrients participate. Energy/macronutrients and total/saturated
fat are correlated; targeting all of them can double-count a goal. Vitamins and
minerals are optional. Fiber, saturated fat, and especially vitamin D have limited
coverage. Missing, negative, nonfinite, incompatible-unit, or conflicting values
are unknown, never zero. Missing active target or hard-limit nutrients exclude a
food. Results include `excluded`, `scales`, `warnings`, `eligible_count`, and
`portion_grams`; each match has `fdc_id`, nutrients, distance and squared-distance
`contributions`. Ties use FDC ID; fewer than k results are allowed.

Energy preference is specific Atwater (958), general Atwater (957), then legacy
kcal (208); never sum these entries. `allow_estimated_energy=True` opts into the
catalog's SR Legacy fallbacks only when native energy is absent. Each match's
`energy_estimate` retains provenance and match notes (still per 100 g), while its
nutrient vector uses the requested portion. Default is no estimates.

## Restrictions and scientific scope

Use `required_restrictions=["vegan", "peanut_free"]` with caller-verified metadata,
e.g. `compatibility={123: {"vegan": True, "peanut_free": True}}`. Missing or false
compatibility excludes a food. This catalog has no verified allergy metadata;
nutrient amounts/names cannot establish allergy or cross-contact safety. Use integer
FDC IDs as compatibility keys. `excluded_fdc_ids` and `limits` are hard filters.
Preserve raw/dry/cooked preparation states; callers must select suitable candidates.

- [USDA Foundation documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/)
  documents values per 100 g, portion scaling, and energy calculation methods.
- [NIH nutrient recommendations](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations/)
  distinguishes daily requirements and upper limits; these are not single-food targets.

This algorithm's feature selection and ranking are engineering choices informed by
those semantics, not a clinically validated diet recommender. KNN does not guarantee
an adequate diet, affordable meals, suitable servings, or an optimal food combination.

## Read and test the live Supabase catalog

Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local`. Process environment variables take precedence. Python reads these
settings directly; no dotenv or Supabase package is required.

```sh
python -m src.lib.nutrition.test_supabase
python -m unittest discover -s tests -p "test_*.py" -v
```

For your own targets:

```python
from src.lib.nutrition.supabase_catalog import load_supabase_foods
from src.lib.nutrition.knn import find_nearest_foods

foods = load_supabase_foods()
result = find_nearest_foods(foods, {"protein": {"amount": 15}}, k=5)
```

The loader sends only GET requests to `public.foods`, selecting `fdc_id` and
`source_record`, ordered by FDC ID and paginated with an exact visible row count.
Empty results, changing counts, duplicate IDs, malformed records, and HTTP failures
are explicit errors. Credentials stay in request headers and are not logged. It
reads all rows visible under the configured key and existing RLS policy; it cannot
prove that hidden rows do not exist. Do not modify the catalog during a test run.
See the [Supabase REST documentation](https://supabase.com/docs/guides/api/creating-routes).

The live runner saves `test-results/supabase-foods.json` and
`test-results/supabase-knn-report.json` locally (gitignored). It compares database
source records with the local manifest, tests each food against its own nutrient
vector, and checks sample macro, energy, sodium-limit, and dietary-filter queries.
These are algorithm/data checks, not clinical validation of recommendations.

Use `source_record`, not the denormalized calorie column, to preserve the existing
KNN energy preference (958, 957, 208). The SQL importer prefers (208, 957, 958), so
its calorie column can differ without indicating corrupt data. Estimate opt-in,
unknown values, and all other KNN rules remain unchanged.

The initial live check retrieved 300 records, with no missing/extra IDs or source
record differences. All 300 exact self-matches passed. Native energy was available
for 250 foods; opting into 12 estimates raised energy coverage to 262. The sample
macro target had 241 eligible foods, and protein/fiber/low-sodium had 126. No foods
passed an unverified vegan restriction. Flour can tie at zero for minimum protein
and fiber targets: this is nutrient similarity, not a ready-to-eat meal suggestion.
