// Node/server-only: load the local catalog without a database or network request.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { filterMeals, type CatalogMeal, type MealFilters } from "./model";

export async function getMeals(
  filters: MealFilters = {},
): Promise<CatalogMeal[]> {
  const catalog = JSON.parse(
    await readFile(join(process.cwd(), "data/mealdb/meals.json"), "utf8"),
  ) as { meals: CatalogMeal[] };
  return filterMeals(catalog.meals, filters);
}
export async function getMeal(id: string): Promise<CatalogMeal | null> {
  return (await getMeals()).find((meal) => meal.id === id) ?? null;
}
