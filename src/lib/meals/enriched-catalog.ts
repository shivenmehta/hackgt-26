// Node/server-only. This reads precalculated data; it does not call Grok or USDA.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogMeal, MealFilters } from "./model";
import type { calculateNutrition } from "./nutrition";
export type EnrichedMeal = Omit<CatalogMeal, "nutrition"> & {
  nutrition: ReturnType<typeof calculateNutrition>;
};
export async function getEnrichedMeals(
  filters: MealFilters = {},
): Promise<EnrichedMeal[]> {
  const { meals } = JSON.parse(
    await readFile(join(process.cwd(), "data/combined/meals.json"), "utf8"),
  ) as { meals: EnrichedMeal[] };
  const q = filters.query?.trim().toLowerCase();
  return meals.filter(
    (m) =>
      (!filters.cuisine || m.cuisine === filters.cuisine) &&
      (!filters.diet || m.dietary[filters.diet] === true) &&
      (!filters.mealType || m.mealTypes.includes(filters.mealType)) &&
      (!q ||
        m.name.toLowerCase().includes(q) ||
        m.ingredients.some((i) => i.name.toLowerCase().includes(q))),
  );
}

export type GrokEnrichedMeal = EnrichedMeal & {
  nutrition: EnrichedMeal["nutrition"] & {
    grokCalories: ReturnType<
      typeof import("./grok-calories").calorieOverlay
    > | null;
  };
};

// Fails on stale output instead of silently serving estimates for a different base catalog.
export async function getGrokEnrichedMeals(
  filters: MealFilters = {},
): Promise<GrokEnrichedMeal[]> {
  const { createHash } = await import("node:crypto");
  const [raw, enriched] = await Promise.all([
    readFile(join(process.cwd(), "data/combined/meals.json"), "utf8"),
    readFile(join(process.cwd(), "data/combined/meals-grok.json"), "utf8"),
  ]);
  const catalog = JSON.parse(enriched) as {
    grokEnrichment: { baseSha256: string };
    meals: GrokEnrichedMeal[];
  };
  if (
    catalog.grokEnrichment.baseSha256 !==
    createHash("sha256").update(raw).digest("hex")
  ) {
    throw new Error(
      "Grok catalog is stale. Run npm run meals:grok -- --offline to rebuild from valid cached estimates.",
    );
  }
  const ids = new Set((await getEnrichedMeals(filters)).map((m) => m.id));
  return catalog.meals.filter((m) => ids.has(m.id));
}
