import { ingredientPriceKey } from "./types";
import type { WeeklyPlan, Recipe } from "../planner";
import { dailyTargets, categories } from "./validation";
import {
  nutrientKeys,
  type PlanSnapshot,
  type Selection,
  type PricedMeal,
  type Rankings,
} from "./types";
export function validateSelections(
  selections: Selection[],
  recipes: PricedMeal[],
  rankings: Rankings,
) {
  if (selections.length !== 21) throw new Error("A week needs 21 meals.");
  const seen = new Set<string>();
  for (const s of selections) {
    const key = `${s.day}:${s.category}`;
    if (
      !Number.isInteger(s.day) ||
      s.day < 0 ||
      s.day > 6 ||
      !categories.includes(s.category) ||
      seen.has(key) ||
      !recipes.some((r) => r.id === s.recipeId) ||
      !rankings[s.category].some(
        (r) =>
          r.id === s.recipeId && r.options.some((o) => o.portion === s.portion),
      )
    )
      throw new Error("Invalid meal selection.");
    seen.add(key);
  }
}
export function mealCost(recipe: PricedMeal, portion: number, people: number) {
  return Math.round(recipe.perServingCents * portion * people);
}
export function deterministicSelections(rankings: Rankings): Selection[] {
  return Array.from({ length: 7 }, (_, day) =>
    categories.map((category) => {
      const choices = rankings[category];
      if (!choices.length) throw new Error(`No eligible ${category} recipes.`);
      const choice = choices[day % Math.min(choices.length, 7)];
      return { day, category, recipeId: choice.id, portion: choice.portion };
    }),
  ).flat();
}
export function repairBudget(
  selections: Selection[],
  recipes: PricedMeal[],
  rankings: Rankings,
  people: number,
  budgetCents: number,
) {
  const result = selections.map((s) => ({ ...s }));
  const lookup = new Map(recipes.map((r) => [r.id, r]));
  const cost = (s: Selection) =>
    mealCost(lookup.get(s.recipeId)!, s.portion, people);
  let total = result.reduce((sum, s) => sum + cost(s), 0);
  // Every move strictly decreases integer cents, terminating at budget or the cheapest allowed plan.
  for (
    let iteration = 0;
    total > budgetCents && iteration < 1000;
    iteration++
  ) {
    let best:
      | { index: number; selection: Selection; saving: number; penalty: number }
      | undefined;
    result.forEach((current, index) => {
      const distance = rankings[current.category]
        .find((r) => r.id === current.recipeId)!
        .options.find((o) => o.portion === current.portion)!.distance;
      for (const candidate of rankings[current.category])
        for (const option of candidate.options) {
          const selection = {
            ...current,
            recipeId: candidate.id,
            portion: option.portion,
          };
          const saving = cost(current) - cost(selection);
          if (saving <= 0) continue;
          const penalty = Math.max(0, option.distance - distance) / saving;
          if (
            !best ||
            penalty < best.penalty ||
            (penalty === best.penalty && saving > best.saving)
          )
            best = { index, selection, saving, penalty };
        }
    });
    if (!best) break;
    result[best.index] = best.selection;
    total -= best.saving;
  }
  if (total > budgetCents) {
    // Slots are independent: choosing each minimum proves the available cost floor.
    for (let index = 0; index < result.length; index++) {
      let cheapest = result[index];
      for (const candidate of rankings[cheapest.category])
        for (const option of candidate.options) {
          const next = {
            ...cheapest,
            recipeId: candidate.id,
            portion: option.portion,
          };
          if (cost(next) < cost(cheapest)) cheapest = next;
        }
      result[index] = cheapest;
    }
  }
  return result;
}
export function buildWeeklyPlan(snapshot: PlanSnapshot): WeeklyPlan {
  const { preferences: p, recipes, weekStart, store } = snapshot;
  validateSelections(snapshot.selections, recipes, snapshot.rankings);
  const days = Array.from({ length: 7 }, (_, day) => {
    const date = new Date(weekStart + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + day);
    const dateString = date.toISOString().slice(0, 10);
    return {
      date: dateString,
      meals: categories.map((category, slotIndex) => {
        const s = snapshot.selections.find(
          (s) => s.day === day && s.category === category,
        )!;
        const r = recipes.find((r) => r.id === s.recipeId)!;
        const ratio = s.portion / r.yield;
        const alternatives = category === "breakfast" && r.breakfastAlternative;
        const recipe: Recipe = {
          id: r.id,
          name: r.name,
          cuisine: r.cuisine,
          description: alternatives
            ? "Breakfast alternative selected from eligible main dishes."
            : "Recipe from TheMealDB. Nutrition and portions are estimates.",
          kind: r.diets.Vegan
            ? "vegan"
            : r.diets.Vegetarian
              ? "vegetarian"
              : "meat",
          allergens: Object.entries(r.allergens)
            .filter(([, v]) => v === true)
            .map(([k]) => k) as Recipe["allergens"],
          occasion: category === "breakfast" ? "breakfast" : "main",
          minutes: r.minutes,
          art: "bowl",
          imageUrl: r.imageUrl,
          portion: s.portion,
          originalYield: r.yield,
          ingredients: r.ingredients.map((i, index) => ({
            name: i.name,
            groceryKey: ingredientPriceKey(i),
            preparation: i.assumptions,
            grams: i.grams * ratio,
            costCents: i.grams * ratio * r.prices[index].centsPerGram,
          })),
          steps: r.instructions
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean),
          nutrition: Object.fromEntries(
            nutrientKeys.map((k) => [
              k,
              Math.round(r.nutrition[k] * ratio * 10) / 10,
            ]),
          ) as Recipe["nutrition"],
          estimatedCents: mealCost(r, s.portion, p.people) / p.people,
          pricingNote: `${store.reference ? "Reference store: " : ""}${store.name}. ${r.prices.filter((x) => x.source === "grok-average").length} of ${r.prices.length} ingredients use unverified Grok US-average estimates.`,
          assumptions: [
            ...r.assumptions,
            ...r.ingredients.map(
              (i, index) =>
                `${i.name}: ${i.assumptions} Price: ${r.prices[index].assumptions} (${r.prices[index].fetchedAt.slice(0, 10)}).`,
            ),
          ],
        };
        return {
          id: `${dateString}-${slotIndex}`,
          slot: category[0].toUpperCase() + category.slice(1),
          slotIndex,
          recipe,
        };
      }),
    };
  });
  return {
    preferences: p,
    days,
    totalCents: snapshot.selections.reduce(
      (sum, s) =>
        sum +
        mealCost(
          recipes.find((r) => r.id === s.recipeId)!,
          s.portion,
          p.people,
        ),
      0,
    ),
    warnings: snapshot.warnings,
    storeName: store.name,
    dailyTargets: dailyTargets(p),
  };
}
