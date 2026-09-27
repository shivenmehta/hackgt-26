import type { PreparedMeal, Rankings } from "./types";

export const SHORTLIST_PER_CATEGORY = 20;

/** Union category leaders without duplicating recipes shared by lunch/dinner. */
export function shortlistMeals(
  eligible: PreparedMeal[],
  rankings: Rankings,
  limit = SHORTLIST_PER_CATEGORY,
): PreparedMeal[] {
  const ids = new Set(
    Object.values(rankings).flatMap((rows) =>
      rows.slice(0, limit).map((r) => r.id),
    ),
  );
  return eligible.filter((recipe) => ids.has(recipe.id));
}

/** Keep rank order and portion alternatives, excluding meals without prices. */
export function pricedRankings(
  rankings: Rankings,
  recipes: PreparedMeal[],
): Rankings {
  const ids = new Set(recipes.map((r) => r.id));
  return {
    breakfast: rankings.breakfast.filter((r) => ids.has(r.id)),
    lunch: rankings.lunch.filter((r) => ids.has(r.id)),
    dinner: rankings.dinner.filter((r) => ids.has(r.id)),
  };
}
