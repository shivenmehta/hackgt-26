import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { format } from "prettier";
import type { CatalogMeal } from "../../src/lib/meals/model";
import {
  calculateNutrition,
  normalizeName,
  readNutrients,
  nutrientKeys,
  type IngredientMatch,
  type NutritionFood,
  type Portion,
} from "../../src/lib/meals/nutrition";

const root = "data/combined";
async function json(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function save(name: string, value: unknown) {
  const path = join(root, name);
  await writeFile(
    path + ".tmp",
    await format(JSON.stringify(value), { parser: "json" }),
  );
  await rename(path + ".tmp", path);
}
async function main() {
  const catalog = (await json("data/mealdb/meals.json")) as {
    meals: CatalogMeal[];
  };
  const manifest = (await json("data/usda/foundation-manifest.json")) as {
    slug: string;
    fdcId: number;
    file: string;
  }[];
  const localRules = (await json(join(root, "ingredient-matches.json"))) as {
    slug: string;
    aliases: string[];
    kind: "direct" | "proxy";
    notes: string;
  }[];
  const externalRules = (await json(join(root, "external-matches.json"))) as {
    aliases: string[];
    fdcId: number | null;
    kind: "proxy" | "search-candidate";
    notes: string;
  }[];
  const portions = (await json(join(root, "usda-portions.json"))) as {
    slug: string;
    fdcId: number;
    foodPortions: Portion[];
  }[];
  const proxies = (await json(join(root, "portion-proxies.json"))) as Record<
    string,
    number
  >;
  const nutrientProxies = (await json(
    join(root, "nutrient-proxies.json"),
  )) as Record<string, { fdcId: number; notes: string }>;
  const foods = new Map<number, NutritionFood>();
  const matches = new Map<string, IngredientMatch>();
  const sourceHashes: Record<string, string> = {};
  async function source(path: string) {
    const text = await readFile(path, "utf8");
    sourceHashes[path] = createHash("sha256").update(text).digest("hex");
    return JSON.parse(text);
  }
  function normalized(
    record: Record<string, unknown>,
    sourceFile: string,
    extraPortions?: Portion[],
    portionId?: number,
  ): NutritionFood {
    const f = (record.food ?? record) as {
      fdcId: number;
      description: string;
      dataType: string;
      foodPortions?: Portion[];
    };
    if (
      !Number.isSafeInteger(f.fdcId) ||
      !f.description ||
      !["Foundation", "SR Legacy"].includes(f.dataType)
    )
      throw new Error(`Invalid USDA record ${sourceFile}`);
    return {
      fdcId: f.fdcId,
      description: f.description,
      dataType: f.dataType,
      ...readNutrients(record),
      sourceFile,
      portions: extraPortions ?? f.foodPortions ?? [],
      portionSourceFdcId: portionId ?? f.fdcId,
    };
  }
  async function external(id: number) {
    if (foods.has(id)) return foods.get(id)!;
    const path = join(root, "usda-foods", `${id}.json`);
    const food = normalized(await source(path), path);
    if (food.fdcId !== id) throw new Error("USDA ID mismatch");
    foods.set(id, food);
    return food;
  }
  for (const rule of localRules) {
    const entry = manifest.find((f) => f.slug === rule.slug);
    if (!entry) throw new Error(`Unknown local USDA slug ${rule.slug}`);
    const path = join("data/usda", entry.file);
    const record = await source(path);
    let p = portions.find((p) => p.fdcId === entry.fdcId)?.foodPortions ?? [];
    let portionId = entry.fdcId;
    if (proxies[rule.slug]) {
      const proxy = await external(proxies[rule.slug]);
      p = proxy.portions;
      portionId = proxy.fdcId;
    }
    const food = normalized(record, path, p, portionId);
    if (food.fdcId !== entry.fdcId) throw new Error("Local USDA ID mismatch");
    const nutrientProxy = nutrientProxies[rule.slug];
    if (nutrientProxy) {
      const proxy = await external(nutrientProxy.fdcId);
      food.nutrientProvenance = {};
      for (const key of nutrientKeys) {
        if (food.nutrients[key] === null && proxy.nutrients[key] !== null) {
          food.nutrients[key] = proxy.nutrients[key];
          food.nutrientProvenance[key] = {
            method: "usda-proxy",
            fdcId: proxy.fdcId,
            description: proxy.description,
            notes: nutrientProxy.notes,
            basisGrams: 100,
          };
          if (key === "caloriesKcal") {
            food.caloriesIsEstimate = true;
            food.calorieProvenance = food.nutrientProvenance[key];
          }
        }
      }
    }
    for (const name of rule.aliases) {
      const key = normalizeName(name);
      if (matches.has(key))
        throw new Error(`Duplicate ingredient alias ${key}`);
      matches.set(key, { food, kind: rule.kind, notes: rule.notes });
    }
  }
  for (const rule of externalRules) {
    if (rule.fdcId === null) continue;
    const food = await external(rule.fdcId);
    for (const name of rule.aliases)
      if (!matches.has(normalizeName(name)))
        matches.set(normalizeName(name), {
          food,
          kind: rule.kind,
          notes: rule.notes,
        });
  }
  const meals = catalog.meals.map((meal) => ({
    ...meal,
    nutrition: calculateNutrition(meal.ingredients, matches),
  }));
  const unresolved = new Map<
    string,
    { ingredient: string; occurrences: number; mealIds: string[] }
  >();
  for (const meal of meals)
    for (const row of meal.nutrition.ingredients)
      if (!row.match) {
        const key = normalizeName(row.name);
        const item = unresolved.get(key) ?? {
          ingredient: key,
          occurrences: 0,
          mealIds: [],
        };
        item.occurrences++;
        if (!item.mealIds.includes(meal.id)) item.mealIds.push(meal.id);
        unresolved.set(key, item);
      }
  for (const path of [
    "data/mealdb/meals.json",
    "data/usda/foundation-manifest.json",
    ...[
      "ingredient-matches.json",
      "external-matches.json",
      "usda-portions.json",
      "portion-proxies.json",
      "nutrient-proxies.json",
    ].map((f) => join(root, f)),
  ])
    await source(path);
  const report = {
    schemaVersion: 1,
    mealCount: meals.length,
    ingredientLines: meals.reduce((s, m) => s + m.ingredients.length, 0),
    matchedLines: meals.reduce((s, m) => s + m.nutrition.coverage.matched, 0),
    quantitiesConverted: meals.reduce(
      (s, m) => s + m.nutrition.coverage.quantitiesConverted,
      0,
    ),
    assumed100gLines: meals.reduce(
      (s, m) => s + m.nutrition.coverage.assumed100g,
      0,
    ),
    statusCounts: Object.fromEntries(
      ["calculated-estimate", "assumed-quantities", "partial"].map((status) => [
        status,
        meals.filter((m) => m.nutrition.status === status).length,
      ]),
    ),
    unresolvedIngredients: [...unresolved.values()].sort(
      (a, b) =>
        b.occurrences - a.occurrences ||
        a.ingredient.localeCompare(b.ingredient),
    ),
    sourceHashes,
  };
  await mkdir(root, { recursive: true });
  await save("meals.json", {
    schemaVersion: 1,
    attribution:
      "Recipes: TheMealDB. Nutrient data and household portion weights: USDA FoodData Central.",
    calculationVersion: 1,
    meals,
  });
  await save("report.json", report);
  console.log(
    JSON.stringify(
      {
        ...report,
        unresolvedIngredients: report.unresolvedIngredients.length,
        sourceHashes: Object.keys(sourceHashes).length,
      },
      null,
      2,
    ),
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Nutrition build failed",
  );
  process.exitCode = 1;
});
