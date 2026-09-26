export const DIETS = [
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Gluten-free",
  "Dairy-free",
] as const;
export const ALLERGENS = [
  "Milk",
  "Eggs",
  "Fish",
  "Shellfish",
  "Tree nuts",
  "Peanuts",
  "Wheat",
  "Soy",
  "Sesame",
] as const;
export const CUISINES = [
  "Mediterranean",
  "Mexican",
  "Indian",
  "East Asian",
  "American",
] as const;
export type Diet = (typeof DIETS)[number];
export type Allergen = (typeof ALLERGENS)[number];
export type Cuisine = (typeof CUISINES)[number];
export interface PreferenceDraft {
  budget: string;
  location: string;
  age: string;
  bmi: string;
  people: string;
  meals: string;
  diets: Diet[];
  allergens: Allergen[];
  cuisines: Cuisine[];
  notes: string;
}
export interface Preferences {
  budget: number;
  location: string;
  age: number;
  bmi: number;
  people: number;
  meals: number;
  diets: Diet[];
  allergens: Allergen[];
  cuisines: Cuisine[];
  notes: string;
}
export const initialDraft: PreferenceDraft = {
  budget: "75",
  location: "",
  age: "",
  bmi: "",
  people: "1",
  meals: "3",
  diets: [],
  allergens: [],
  cuisines: [],
  notes: "",
};
export type InputKey =
  "budget" | "location" | "age" | "bmi" | "people" | "meals";
export function validatePreferences(
  d: PreferenceDraft,
): Partial<Record<InputKey, string>> {
  const errors: Partial<Record<InputKey, string>> = {};
  for (const [key, label] of [
    ["budget", "weekly budget"],
    ["age", "age"],
    ["bmi", "BMI"],
    ["people", "number of people"],
    ["meals", "meals per day"],
  ] as const) {
    const value = Number(d[key]);
    if (!d[key].trim() || !Number.isFinite(value) || value <= 0)
      errors[key] = `Enter a ${label} greater than zero.`;
    else if (
      ["age", "people", "meals"].includes(key) &&
      !Number.isSafeInteger(value)
    )
      errors[key] = `Enter a whole number for ${label}.`;
  }
  if (Number(d.meals) > 6)
    errors.meals = "Choose between 1 and 6 meals per day.";
  if (!d.location.trim()) errors.location = "Enter your city or ZIP code.";
  return errors;
}
export function parsePreferences(d: PreferenceDraft): Preferences {
  if (Object.keys(validatePreferences(d)).length)
    throw new Error("Check your preferences before building a plan.");
  return {
    ...d,
    budget: Number(d.budget),
    age: Number(d.age),
    bmi: Number(d.bmi),
    people: Number(d.people),
    meals: Number(d.meals),
    location: d.location.trim(),
  };
}
export interface Ingredient {
  name: string;
  grams: number;
  costCents: number;
}
export interface Recipe {
  id: string;
  name: string;
  description: string;
  cuisine: Cuisine;
  kind: "vegan" | "vegetarian" | "fish" | "meat";
  allergens: Allergen[];
  occasion: "breakfast" | "main" | "snack";
  minutes: number;
  ingredients: Ingredient[];
  steps: string[];
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  art: "bowl" | "toast" | "wrap";
}
export interface PlannedMeal {
  id: string;
  slot: string;
  slotIndex: number;
  recipe: Recipe;
}
export interface PlannedDay {
  date: string;
  meals: PlannedMeal[];
}
export interface WeeklyPlan {
  preferences: Preferences;
  days: PlannedDay[];
  totalCents: number;
}
export const perServingCents = (r: Recipe) =>
  r.ingredients.reduce((n, i) => n + i.costCents, 0);
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function isEligible(r: Recipe, p: Preferences) {
  if (p.allergens.some((a) => r.allergens.includes(a))) return false;
  return p.diets.every((d) => {
    if (d === "Vegan") return r.kind === "vegan";
    if (d === "Vegetarian")
      return r.kind === "vegan" || r.kind === "vegetarian";
    if (d === "Pescatarian") return r.kind !== "meat";
    if (d === "Gluten-free") return !r.allergens.includes("Wheat");
    return !r.allergens.includes("Milk");
  });
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function buildSamplePlan(
  p: Preferences,
  recipes: Recipe[],
  now = new Date(),
): WeeklyPlan {
  const eligible = recipes.filter((r) => isEligible(r, p));
  const preferred = eligible.filter((r) => p.cuisines.includes(r.cuisine));
  // Cuisine is a soft preference; supported diet/allergen filters are always hard filters.
  const pool = preferred.length ? preferred : eligible;
  if (!pool.length) return { preferences: p, days: [], totalCents: 0 };
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const slots = ["Breakfast", "Lunch", "Dinner", "Meal 4", "Meal 5", "Meal 6"];
  const days = Array.from({ length: 7 }, (_, day) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + day);
    return {
      date: localDate(date),
      meals: Array.from({ length: p.meals }, (_, slotIndex) => {
        const occasion =
          slotIndex === 0 ? "breakfast" : slotIndex < 3 ? "main" : "snack";
        const matches = pool.filter((r) => r.occasion === occasion);
        const choices = matches.length ? matches : pool;
        return {
          id: `${localDate(date)}-${slotIndex}`,
          slot: p.meals === 3 ? slots[slotIndex] : `Meal ${slotIndex + 1}`,
          slotIndex,
          recipe: choices[(day + slotIndex) % choices.length],
        };
      }),
    };
  });
  const totalCents = days.reduce(
    (sum, day) =>
      sum +
      day.meals.reduce((n, m) => n + perServingCents(m.recipe) * p.people, 0),
    0,
  );
  return { preferences: p, days, totalCents };
}
