import type { Allergen, Diet, Preferences, WeeklyPlan } from "../planner";
export const nutrientKeys = [
  "calories",
  "protein",
  "fat",
  "fiber",
  "carbs",
] as const;
export type Nutrient = (typeof nutrientKeys)[number];
export type Nutrition = Record<Nutrient, number>;
export type Category = "breakfast" | "lunch" | "dinner";
export type Level = "low" | "medium" | "high";
export const presets: Record<Nutrient, Record<Level, number>> = {
  calories: { low: 1800, medium: 2000, high: 2200 },
  protein: { low: 75, medium: 100, high: 125 },
  fat: { low: 45, medium: 65, high: 80 },
  fiber: { low: 20, medium: 28, high: 35 },
  carbs: { low: 200, medium: 250, high: 300 },
};
export interface PreparedMeal {
  id: string;
  name: string;
  cuisine: string;
  fingerprint: string;
  yield: number;
  minutes: number;
  breakfastAlternative?: boolean;
  categories: Category[];
  diets: Record<Diet, boolean | null>;
  allergens: Record<Allergen, boolean | null>;
  assumptions: string[];
  instructions: string;
  imageUrl: string;
  nutrition: Nutrition;
  ingredients: {
    position: number;
    name: string;
    measurement: string;
    grams: number;
    assumptions: string;
  }[];
}
export interface Price {
  centsPerGram: number;
  source: "kroger" | "grok-average";
  storeId: string;
  productId?: string;
  description: string;
  packageGrams?: number;
  regularCents?: number;
  assumptions: string;
  fetchedAt: string;
}
export interface PricedMeal extends PreparedMeal {
  prices: Price[];
  perServingCents: number;
}
export interface RankOption {
  portion: number;
  distance: number;
  deviations: Nutrition;
}
export interface RankedMeal extends RankOption {
  id: string;
  options: RankOption[];
}
export type Rankings = Record<Category, RankedMeal[]>;
export interface Store {
  id: string;
  name: string;
  reference: boolean;
  reason?: string;
}
export interface PlanSnapshot {
  preferences: Preferences;
  recipes: PricedMeal[];
  rankings: Rankings;
  store: Store;
  warnings: string[];
  weekStart: string;
  selections: Selection[];
}
export interface Selection {
  day: number;
  category: Category;
  recipeId: string;
  portion: number;
}
export interface PlanJob {
  id: string;
  owner_hash: string;
  request_hash: string;
  status: "queued" | "running" | "ready" | "failed" | "cancelled";
  stage: string;
  error?: string;
  preferences: Preferences;
  week_start: string;
  snapshot?: PlanSnapshot;
  plan?: WeeklyPlan;
  version: number;
  images_done: boolean;
  created_at: string;
  workflow_id?: string | null;
}

/** Price identity excludes recipe quantity but keeps purchase/preparation state. */
export function ingredientPriceKey(ingredient: {
  name: string;
  measurement: string;
  assumptions: string;
}) {
  const context =
    `${ingredient.name} ${ingredient.measurement} ${ingredient.assumptions}`.toLowerCase();
  const states = [
    "cooked",
    "uncooked",
    "raw",
    "dry",
    "dried",
    "canned",
    "drained",
    "frozen",
    "fresh",
    "peeled",
    "unpeeled",
    "bone-in",
    "boneless",
    "skin-on",
    "skinless",
    "ground",
    "powder",
    "concentrate",
    "diluted",
  ];
  const flags = states.filter((state) =>
    new RegExp(`\\b${state}\\b`).test(context),
  );
  return JSON.stringify([ingredient.name.toLowerCase().trim(), flags]);
}
