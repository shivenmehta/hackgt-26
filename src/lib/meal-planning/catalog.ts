import { format } from "prettier";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { getMeals } from "../meals/catalog";
import { ALLERGENS, DIETS, type Preferences } from "../planner";
import { grokJSON } from "./grok";
import { nutritionSchema, categories } from "./validation";
import { nutrientKeys, type PreparedMeal } from "./types";
const VERSION = 1;
const metadataSchema = z.object({
  yield: z.number().int().min(1).max(100),
  minutes: z.number().int().min(1).max(1440),
  diets: z.object(
    Object.fromEntries(DIETS.map((k) => [k, z.boolean().nullable()])) as Record<
      (typeof DIETS)[number],
      z.ZodNullable<z.ZodBoolean>
    >,
  ),
  allergens: z.object(
    Object.fromEntries(
      ALLERGENS.map((k) => [k, z.boolean().nullable()]),
    ) as Record<(typeof ALLERGENS)[number], z.ZodNullable<z.ZodBoolean>>,
  ),
  assumptions: z.array(z.string()).max(30),
});
export function allowed(
  meal: PreparedMeal,
  p: Preferences,
  excluded: string[] = [],
): boolean {
  return (
    (!p.cuisines.length || p.cuisines.some((c) => c === meal.cuisine)) &&
    p.diets.every((d) => meal.diets[d] === true) &&
    p.allergens.every((a) => meal.allergens[a] === false) &&
    !meal.ingredients.some((i) =>
      excluded.some((e) => i.name.toLowerCase().includes(e.toLowerCase())),
    )
  );
}
export async function sourceMeals() {
  const recipes = await getMeals();
  const raw = JSON.parse(
    await readFile(
      join(process.cwd(), "data/grok-best-effort/meals.json"),
      "utf8",
    ),
  ) as {
    meals: {
      id: string;
      cacheFile: string;
      status: string;
      caloriesKcal: number;
      proteinG: number;
      fatG: number;
      fiberG: number;
      carbsG: number;
    }[];
  };
  return Promise.all(
    recipes.map(async (recipe) => {
      const n = raw.meals.find((n) => n.id === recipe.id);
      if (!n || n.status !== "estimated")
        throw new Error(`Missing nutrition for ${recipe.id}.`);
      const cache = JSON.parse(
        await readFile(
          join(process.cwd(), "data/grok-best-effort", n.cacheFile),
          "utf8",
        ),
      ) as {
        estimates: { position: number; grams: number; assumptions: string }[];
      };
      const nutrition = nutritionSchema.parse({
        calories: n.caloriesKcal,
        protein: n.proteinG,
        fat: n.fatG,
        fiber: n.fiberG,
        carbs: n.carbsG,
      });
      const ingredients = recipe.ingredients.map((i) => {
        const g = cache.estimates.find((e) => e.position === i.position);
        if (!g || !Number.isFinite(g.grams) || g.grams <= 0)
          throw new Error(
            `Missing gram estimate for ${recipe.id}/${i.position}.`,
          );
        return {
          ...i,
          measurement: i.measurement ?? "",
          grams: g.grams,
          assumptions: g.assumptions,
        };
      });
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ VERSION, recipe, nutrition, ingredients }))
        .digest("hex");
      return { recipe, nutrition, ingredients, fingerprint };
    }),
  );
}
export async function prepareOne(
  source: Awaited<ReturnType<typeof sourceMeals>>[number],
): Promise<PreparedMeal> {
  const { recipe, nutrition, ingredients, fingerprint } = source;
  const metadata = await grokJSON(
    "Estimate the ORIGINAL recipe serving count and total preparation minutes using ingredients and instructions, not a desired calorie target. Classify listed ingredients conservatively. For each allergen: true if present, false only when confidently absent, null if ambiguous (including unspecified compound sauces). For each dietary pattern: true only if all ingredients compatible, false if incompatible, null if unknown. Gluten-free excludes barley, rye, wheat and uncertified oats; wheat-free is not gluten-free. Do not propose substitutions. Record serving and classification assumptions.",
    { recipe, ingredients },
    metadataSchema,
  );
  if (recipe.dietary.vegan === false) metadata.diets.Vegan = false;
  if (recipe.dietary.vegetarian === false) metadata.diets.Vegetarian = false;
  return {
    id: recipe.id,
    name: recipe.name,
    cuisine: recipe.cuisine,
    fingerprint,
    ...metadata,
    categories: recipe.mealTypes.filter((x): x is (typeof categories)[number] =>
      categories.some((c) => c === x),
    ),
    instructions: recipe.instructions,
    imageUrl: recipe.imageUrl ?? "",
    ingredients,
    nutrition,
  };
}
export async function readPrepared(): Promise<PreparedMeal[]> {
  const sources = await sourceMeals();
  let saved: { meals: PreparedMeal[] };
  try {
    saved = JSON.parse(
      await readFile(join(process.cwd(), "data/planner/prepared.json"), "utf8"),
    );
  } catch {
    throw new Error(
      "Recipe metadata is not prepared. Run npm run planner:prepare before building plans.",
    );
  }
  return sources.map((s) => {
    const m = saved.meals.find(
      (m) => m.id === s.recipe.id && m.fingerprint === s.fingerprint,
    );
    if (!m)
      throw new Error(
        `Recipe ${s.recipe.id} needs preparation. Run npm run planner:prepare.`,
      );
    return m;
  });
}
export async function prepareCatalog(limit = Infinity, offline = false) {
  const sources = await sourceMeals();
  const dir = join(process.cwd(), "data/planner");
  await mkdir(join(dir, "cache"), { recursive: true });
  const meals: PreparedMeal[] = [];
  let calls = 0;
  for (let offset = 0; offset < sources.length; offset += 4) {
    const batch = await Promise.all(
      sources.slice(offset, offset + 4).map(async (s) => {
        const file = join(dir, "cache", s.fingerprint + ".json");
        let meal: PreparedMeal | undefined;
        try {
          meal = JSON.parse(await readFile(file, "utf8"));
        } catch {}
        if (!meal && !offline && calls < limit) {
          calls++;
          meal = await prepareOne(s);
          await writeFile(
            file,
            await format(JSON.stringify(meal), { parser: "json" }),
          );
        }
        return meal;
      }),
    );
    meals.push(...batch.filter((m): m is PreparedMeal => !!m));
    console.log(
      `Prepared ${meals.length}/${sources.length} recipe metadata records.`,
    );
  }
  await writeFile(
    join(dir, "prepared.json"),
    JSON.stringify(
      {
        schemaVersion: VERSION,
        notice:
          "Unverified Grok recipe yields and classifications; whole-recipe nutrition preserved.",
        meals,
      },
      null,
      2,
    ) + "\n",
  );
  const output = join(dir, "prepared.json");
  await writeFile(
    output,
    await format(await readFile(output, "utf8"), { parser: "json" }),
  );
  return { prepared: meals.length, total: sources.length, calls };
}
export function servingNutrition(m: PreparedMeal) {
  return Object.fromEntries(
    nutrientKeys.map((k) => [k, m.nutrition[k] / m.yield]),
  ) as PreparedMeal["nutrition"];
}
