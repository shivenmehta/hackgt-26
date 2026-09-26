> Imported from the pre-event `hackgt-2026` project. Implementation, script,
> and catalog availability statements below describe that source repository;
> this new checkout currently contains dependencies and documentation only.

# USDA Foundation starter catalog

Downloaded September 25, 2026. This is a curated set of 100 common ingredients,
not a ranked claim about the world's most-used foods or a complete meal dataset.

## Files and structure

- `foundation/`: 100 catalog food records plus an earlier experiment.
- `foundation-manifest.json`: reviewed IDs, names, search phrases, and file paths.
- The manifest is the authoritative list of catalog entries; do not count every JSON
  file in the folder as an ingredient. `foundation/brown-rice.json` is a preserved
  earlier experiment containing FDC 1104812, **brown rice flour**. Use
  `foundation/brown-rice-raw.json` for rice grains.

Each food file uses the same wrapper: `name`, `fetchedAt`, `source`, and `food`.
`food` preserves USDA's abridged response without replacing missing values.
Nutrients use `food.foodNutrients[].number`, `amount`, and `unitName`.
Some nutrient entries omit `amount`; treat those as unknown even when a nutrient
number is present. Across the 100 records, 12 have no native numeric kcal entry. These now carry
a separately sourced energy fallback as described below.

Searches were restricted to Foundation. Candidates were reviewed by description,
then fetched individually through the get-food script using `format=abridged`.
The imported ID, description, and data type were verified against the manifest.
Search used GET `/foods/search`; download used GET `/food/{fdcId}`.

## Sourced calorie fallbacks

The 12 foods missing native energy now include `nutritionFallbacks.energy` at
wrapper level. The original `food` response and its `foodNutrients` remain unchanged.
These values come from individually fetched SR Legacy records, not LLM estimates.
FDC IDs identify separate records; the fallback IDs differ from the Foundation IDs.

Each fallback stores `amount`, `unitName`, `basisGrams: 100`, `isEstimate: true`,
match notes, and the source FDC ID, description, nutrient number, URL, derivation,
and retrieval time. They are estimates **for the target Foundation food**, even
though the values themselves were copied from USDA. Some matches use a broader
variety or formulation. Leeks have a different edible portion (bulb/lower leaf
versus bulb/greens), so their fallback needs particular care.

The app should prefer numeric native kcal values; when absent, it may explicitly
use `nutritionFallbacks.energy.amount` and display that it is an estimate. Check
for null/missing values, not truthiness: table salt has a sourced value of 0 kcal.
Do not append proxy nutrients to the Foundation array or present them as native
measurements. No protein or other missing nutrients were filled. The coverage
table below continues to describe the original Foundation values only.

| Catalog food           | Fallback kcal / 100 g | Source FDC ID                                                    | Match note                                                                                                                                    |
| ---------------------- | --------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| spaghetti-dry          | 371                   | [169736](https://fdc.nal.usda.gov/food-details/169736/nutrients) | Generic enriched dry pasta; shape is not specified as spaghetti.                                                                              |
| butter-unsalted        | 717                   | [173430](https://fdc.nal.usda.gov/food-details/173430/nutrients) | Unsalted butter; source does not specify stick form.                                                                                          |
| olive-oil-extra-virgin | 884                   | [171413](https://fdc.nal.usda.gov/food-details/171413/nutrients) | Generic olive oil; extra-virgin grade is not specified.                                                                                       |
| peanut-butter-creamy   | 588                   | [174294](https://fdc.nal.usda.gov/food-details/174294/nutrients) | Generic smooth peanut butter; formulations may differ.                                                                                        |
| pumpkin-peeled-raw     | 26                    | [168448](https://fdc.nal.usda.gov/food-details/168448/nutrients) | Raw edible pumpkin; pie-pumpkin variety is not specified.                                                                                     |
| leeks-raw              | 61                    | [169246](https://fdc.nal.usda.gov/food-details/169246/nutrients) | Source covers bulb and lower leaf only; Foundation covers bulb and greens. Use only as an approximate proxy, not for a precise portion match. |
| watermelon-flesh-raw   | 30                    | [167765](https://fdc.nal.usda.gov/food-details/167765/nutrients) | Raw edible watermelon; seedless variety is not specified.                                                                                     |
| corn-tortilla          | 218                   | [175036](https://fdc.nal.usda.gov/food-details/175036/nutrients) | Corn tortillas ready to bake or fry; shelf-stable formulation is not specified. Not fried tortilla chips.                                     |
| whole-wheat-bread      | 252                   | [172688](https://fdc.nal.usda.gov/food-details/172688/nutrients) | Commercial whole-wheat bread, not toasted; formulations may differ.                                                                           |
| edamame-prepared       | 121                   | [168411](https://fdc.nal.usda.gov/food-details/168411/nutrients) | Frozen, prepared edamame matches the named preparation state.                                                                                 |
| canola-oil             | 884                   | [172336](https://fdc.nal.usda.gov/food-details/172336/nutrients) | Generic canola oil matches the named food.                                                                                                    |
| salt-iodized           | 0                     | [173468](https://fdc.nal.usda.gov/food-details/173468/nutrients) | Generic table salt; iodization is not specified. Zero energy is explicitly reported by USDA, not inferred from missing data.                  |

## Coverage and limitations

The catalog spans grains, legumes, meat/eggs, dairy, fats, vegetables, and fruit.
Searches for tofu, lemon, lime, ginger, several herbs, honey, and vinegar returned
no Foundation results. Quinoa returned only flour. These ingredients were not
substituted with misleading matches. This is a practical selection within
Foundation coverage, not a statistically ranked list of the most common foods.
The expansion added 70 distinct FDC IDs to the original 30.
Selected canned beans and peas include added sodium (and some added sugar) and
are drained/rinsed; preserve those distinctions. Edamame is prepared, while most
new vegetables and unprocessed proteins are raw. Bread and tortillas are
convenience ingredients, rather than raw commodities.

Use the exact USDA descriptions for preparation state. Rice, pasta, and lentils
are uncooked/dry inputs; never apply their nutrient values directly to equal
weights of cooked food. Recipes need explicit quantities, cooking yields, and
appropriate treatment of nutrient retention. The catalog does not provide prices,
store availability, recipes, or independently verified allergen declarations.

Abridged removes portion metadata. Use gram-based quantities, and verify the
measurement basis against USDA documentation when normalizing. Do not invent
serving sizes or infer a missing nutrient is zero. This catalog preserves raw
source values and is not yet a fully normalized nutrition table.

Energy may use nutrient number 208, 957, or 958. These can represent different
calculation methods; choose a documented policy instead of summing them. Also
check kcal versus kJ. The table below reports available kcal entries and missing
fields among the initial planning metrics. It does not judge a food's suitability.

| Ingredient                                                                               | FDC ID  | Available kcal nutrient numbers | Missing selected nutrients                                      |
| ---------------------------------------------------------------------------------------- | ------- | ------------------------------- | --------------------------------------------------------------- |
| [brown-rice-raw](foundation/brown-rice-raw.json)                                         | 2512380 | 957, 958                        | total sugars, saturated fat                                     |
| [white-rice-raw](foundation/white-rice-raw.json)                                         | 2512381 | 957, 958                        | total sugars, saturated fat                                     |
| [rolled-oats](foundation/rolled-oats.json)                                               | 2346396 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [all-purpose-flour](foundation/all-purpose-flour.json)                                   | 789951  | 208                             | fiber, total sugars, saturated fat                              |
| [spaghetti-dry](foundation/spaghetti-dry.json)                                           | 2758998 | missing                         | protein, fat, carbohydrates, fiber, total sugars, saturated fat |
| [lentils-dry](foundation/lentils-dry.json)                                               | 2644283 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [chickpeas-canned-drained-rinsed](foundation/chickpeas-canned-drained-rinsed.json)       | 2644288 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [black-beans-canned-drained-rinsed](foundation/black-beans-canned-drained-rinsed.json)   | 2644285 | 958, 957                        | fiber, total sugars, saturated fat                              |
| [chicken-breast-raw](foundation/chicken-breast-raw.json)                                 | 2646170 | 957, 958                        | fiber, total sugars                                             |
| [ground-beef-90-lean-raw](foundation/ground-beef-90-lean-raw.json)                       | 2514743 | 957, 958                        | fiber, total sugars                                             |
| [eggs-whole](foundation/eggs-whole.json)                                                 | 748967  | 208                             | total sugars                                                    |
| [milk-whole](foundation/milk-whole.json)                                                 | 746782  | 208                             | fiber, total sugars                                             |
| [yogurt-plain-whole-milk](foundation/yogurt-plain-whole-milk.json)                       | 2259793 | 957, 958                        | fiber, total sugars                                             |
| [cheddar-cheese](foundation/cheddar-cheese.json)                                         | 328637  | 208                             | fiber, total sugars                                             |
| [butter-unsalted](foundation/butter-unsalted.json)                                       | 789828  | missing                         | protein, carbohydrates, fiber, total sugars, saturated fat      |
| [olive-oil-extra-virgin](foundation/olive-oil-extra-virgin.json)                         | 748608  | missing                         | protein, fat, carbohydrates, fiber, total sugars, sodium        |
| [russet-potato-peeled-raw](foundation/russet-potato-peeled-raw.json)                     | 2346401 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [yellow-onion-raw](foundation/yellow-onion-raw.json)                                     | 790646  | 208                             | total sugars, saturated fat                                     |
| [garlic-raw](foundation/garlic-raw.json)                                                 | 1104647 | 208                             | total sugars, sodium, saturated fat                             |
| [tomatoes-crushed-canned](foundation/tomatoes-crushed-canned.json)                       | 2685581 | 957, 958                        | total sugars, saturated fat                                     |
| [carrots-raw](foundation/carrots-raw.json)                                               | 2258586 | 957, 958                        | total sugars, saturated fat                                     |
| [broccoli-raw](foundation/broccoli-raw.json)                                             | 747447  | 208                             | total sugars                                                    |
| [red-bell-pepper-raw](foundation/red-bell-pepper-raw.json)                               | 2258590 | 957, 958                        | total sugars, saturated fat                                     |
| [white-button-mushrooms](foundation/white-button-mushrooms.json)                         | 1999629 | 957, 958                        | total sugars, saturated fat                                     |
| [cucumber-with-peel-raw](foundation/cucumber-with-peel-raw.json)                         | 2346406 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [banana-ripe-raw](foundation/banana-ripe-raw.json)                                       | 1105314 | 208                             | total sugars, saturated fat                                     |
| [apple-gala-with-skin-raw](foundation/apple-gala-with-skin-raw.json)                     | 1750341 | 957, 958                        | saturated fat                                                   |
| [sweet-potato-peeled-raw](foundation/sweet-potato-peeled-raw.json)                       | 2346404 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [peanut-butter-creamy](foundation/peanut-butter-creamy.json)                             | 2758989 | missing                         | protein, fat, carbohydrates, total sugars, sodium               |
| [green-cabbage-raw](foundation/green-cabbage-raw.json)                                   | 2346407 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [spinach-baby](foundation/spinach-baby.json)                                             | 1999632 | 957, 958                        | total sugars, saturated fat                                     |
| [kale-raw](foundation/kale-raw.json)                                                     | 323505  | 208                             | total sugars, saturated fat                                     |
| [lettuce-romaine-raw](foundation/lettuce-romaine-raw.json)                               | 2346389 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [celery-raw](foundation/celery-raw.json)                                                 | 2346405 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [cauliflower-raw](foundation/cauliflower-raw.json)                                       | 2685573 | 957, 958                        | total sugars, saturated fat                                     |
| [zucchini-raw](foundation/zucchini-raw.json)                                             | 2685568 | 957, 958                        | total sugars, saturated fat                                     |
| [eggplant-raw](foundation/eggplant-raw.json)                                             | 2685577 | 957, 958                        | total sugars, saturated fat                                     |
| [asparagus-raw](foundation/asparagus-raw.json)                                           | 2710823 | 957, 958                        | total sugars, saturated fat                                     |
| [butternut-squash-raw](foundation/butternut-squash-raw.json)                             | 2685570 | 957, 958                        | total sugars, saturated fat                                     |
| [pumpkin-peeled-raw](foundation/pumpkin-peeled-raw.json)                                 | 2727578 | missing                         | fat, carbohydrates, total sugars, saturated fat                 |
| [green-peas-canned-drained-rinsed](foundation/green-peas-canned-drained-rinsed.json)     | 2644291 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [sweet-corn-raw](foundation/sweet-corn-raw.json)                                         | 2710826 | 957, 958                        | total sugars, saturated fat                                     |
| [green-beans-raw](foundation/green-beans-raw.json)                                       | 2346400 | 957, 958                        | total sugars, saturated fat                                     |
| [beets-raw](foundation/beets-raw.json)                                                   | 2685576 | 957, 958                        | total sugars, saturated fat                                     |
| [radishes-raw](foundation/radishes-raw.json)                                             | 2747665 | 957                             | total sugars, saturated fat                                     |
| [turnips-raw](foundation/turnips-raw.json)                                               | 2747674 | 957                             | total sugars, saturated fat                                     |
| [parsnips-raw](foundation/parsnips-raw.json)                                             | 2747659 | 957                             | total sugars, saturated fat                                     |
| [leeks-raw](foundation/leeks-raw.json)                                                   | 2727584 | missing                         | fat, carbohydrates, total sugars, saturated fat                 |
| [avocado-hass-raw](foundation/avocado-hass-raw.json)                                     | 2710824 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [orange-navel-raw](foundation/orange-navel-raw.json)                                     | 746771  | 208                             | total sugars, saturated fat                                     |
| [strawberries-raw](foundation/strawberries-raw.json)                                     | 2346409 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [blueberries-raw](foundation/blueberries-raw.json)                                       | 2346411 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [raspberries-raw](foundation/raspberries-raw.json)                                       | 2346410 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [pineapple-raw](foundation/pineapple-raw.json)                                           | 2346398 | 957, 958                        | total sugars, saturated fat                                     |
| [mango-tommy-atkins-raw](foundation/mango-tommy-atkins-raw.json)                         | 2710833 | 957, 958                        | total sugars, saturated fat                                     |
| [peach-yellow-raw](foundation/peach-yellow-raw.json)                                     | 325430  | 208                             | total sugars, saturated fat                                     |
| [pear-bartlett-raw](foundation/pear-bartlett-raw.json)                                   | 746773  | 208                             | total sugars, saturated fat                                     |
| [grapes-red-seedless-raw](foundation/grapes-red-seedless-raw.json)                       | 2346412 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [watermelon-flesh-raw](foundation/watermelon-flesh-raw.json)                             | 2747675 | missing                         | fat, carbohydrates, fiber, total sugars, saturated fat          |
| [almonds-raw](foundation/almonds-raw.json)                                               | 2346393 | 957, 958                        | total sugars                                                    |
| [walnuts-raw](foundation/walnuts-raw.json)                                               | 2346394 | 957, 958                        | total sugars                                                    |
| [pecans-raw](foundation/pecans-raw.json)                                                 | 2346395 | 957, 958                        | total sugars                                                    |
| [cashews-raw](foundation/cashews-raw.json)                                               | 2515374 | 957, 958                        | total sugars, saturated fat                                     |
| [peanuts-raw](foundation/peanuts-raw.json)                                               | 2515376 | 957, 958                        | total sugars, saturated fat                                     |
| [pistachios-raw](foundation/pistachios-raw.json)                                         | 2515379 | 957, 958                        | total sugars, saturated fat                                     |
| [sunflower-kernels-raw](foundation/sunflower-kernels-raw.json)                           | 2515381 | 957, 958                        | total sugars, saturated fat                                     |
| [sesame-butter](foundation/sesame-butter.json)                                           | 2262073 | 957, 958                        | total sugars                                                    |
| [chia-seeds-raw](foundation/chia-seeds-raw.json)                                         | 2710819 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [pumpkin-seeds-raw](foundation/pumpkin-seeds-raw.json)                                   | 2515380 | 957, 958                        | total sugars, saturated fat                                     |
| [bulgur-dry](foundation/bulgur-dry.json)                                                 | 2710820 | 957, 958                        | total sugars, saturated fat                                     |
| [whole-wheat-flour](foundation/whole-wheat-flour.json)                                   | 790085  | 208                             | total sugars, saturated fat                                     |
| [cornmeal-enriched](foundation/cornmeal-enriched.json)                                   | 790276  | 208                             | total sugars, saturated fat                                     |
| [corn-tortilla](foundation/corn-tortilla.json)                                           | 2758997 | missing                         | protein, fat, carbohydrates, fiber, total sugars, saturated fat |
| [whole-wheat-bread](foundation/whole-wheat-bread.json)                                   | 2758994 | missing                         | protein, fat, carbohydrates, fiber, total sugars, saturated fat |
| [kidney-beans-canned-drained-rinsed](foundation/kidney-beans-canned-drained-rinsed.json) | 2644289 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [pinto-beans-canned-drained-rinsed](foundation/pinto-beans-canned-drained-rinsed.json)   | 2644292 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [navy-beans-canned-drained-rinsed](foundation/navy-beans-canned-drained-rinsed.json)     | 2644286 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [edamame-prepared](foundation/edamame-prepared.json)                                     | 2758981 | missing                         | protein, fat, carbohydrates, total sugars                       |
| [salmon-atlantic-raw](foundation/salmon-atlantic-raw.json)                               | 2684441 | 957, 958                        | fiber, total sugars                                             |
| [tuna-canned-water-drained](foundation/tuna-canned-water-drained.json)                   | 334194  | 208                             | fiber, total sugars                                             |
| [shrimp-raw](foundation/shrimp-raw.json)                                                 | 2684443 | 957, 958                        | fiber, total sugars, saturated fat                              |
| [cod-atlantic-raw](foundation/cod-atlantic-raw.json)                                     | 2684444 | 957, 958                        | fiber, total sugars                                             |
| [tilapia-raw](foundation/tilapia-raw.json)                                               | 2684442 | 957, 958                        | fiber, total sugars                                             |
| [pork-loin-raw](foundation/pork-loin-raw.json)                                           | 2646168 | 957, 958                        | fiber, total sugars                                             |
| [ground-turkey-93-lean-raw](foundation/ground-turkey-93-lean-raw.json)                   | 2514747 | 957, 958                        | fiber, total sugars                                             |
| [chicken-thigh-raw](foundation/chicken-thigh-raw.json)                                   | 2646171 | 957, 958                        | fiber, total sugars                                             |
| [mozzarella-part-skim](foundation/mozzarella-part-skim.json)                             | 329370  | 208                             | fiber, total sugars                                             |
| [parmesan-grated](foundation/parmesan-grated.json)                                       | 2259795 | 957, 958                        | fiber, total sugars                                             |
| [cottage-cheese-2-percent](foundation/cottage-cheese-2-percent.json)                     | 328841  | 208                             | fiber, total sugars                                             |
| [cream-cheese](foundation/cream-cheese.json)                                             | 2346385 | 957, 958                        | fiber, total sugars                                             |
| [sour-cream](foundation/sour-cream.json)                                                 | 2346387 | 957, 958                        | fiber, total sugars                                             |
| [heavy-cream](foundation/heavy-cream.json)                                               | 2346386 | 957, 958                        | fiber, total sugars                                             |
| [greek-yogurt-plain-whole-milk](foundation/greek-yogurt-plain-whole-milk.json)           | 2259794 | 957, 958                        | fiber, total sugars                                             |
| [canola-oil](foundation/canola-oil.json)                                                 | 748278  | missing                         | protein, fat, carbohydrates, fiber, total sugars, sodium        |
| [sugar-granulated](foundation/sugar-granulated.json)                                     | 746784  | 208                             | fiber, total sugars, saturated fat                              |
| [salt-iodized](foundation/salt-iodized.json)                                             | 746775  | missing                         | protein, fat, carbohydrates, fiber, total sugars, saturated fat |
| [tomato-paste-unsalted](foundation/tomato-paste-unsalted.json)                           | 2685580 | 957, 958                        | total sugars, saturated fat                                     |
| [tomato-sauce-salted](foundation/tomato-sauce-salted.json)                               | 2685579 | 958, 957                        | total sugars, saturated fat                                     |
| [mustard-yellow](foundation/mustard-yellow.json)                                         | 326698  | 208                             | total sugars                                                    |
| [green-bell-pepper-raw](foundation/green-bell-pepper-raw.json)                           | 2258588 | 957, 958                        | total sugars, saturated fat                                     |

## Refreshing

From the repository root, set `USDA_API_KEY` in `.env.local` and run:

```bash
npm run test:usda:get-food -- 2512380 data/usda/foundation/brown-rice-raw.json "Rice, brown, long grain, unenriched, raw"
```

Use the manifest for other IDs and paths. This overwrites the selected local file (including any `nutritionFallbacks`)
and consumes one request. Reapply reviewed fallbacks after refreshing. No keys or authenticated request URLs are stored.

Source: U.S. Department of Agriculture, Agricultural Research Service,
[FoodData Central](https://fdc.nal.usda.gov/), with
[Foundation documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/).
