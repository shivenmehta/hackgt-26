import { z } from "zod";
import { ALLERGENS, CUISINES, DIETS, type Preferences } from "../planner";
import { nutrientKeys, presets, type Nutrition } from "./types";
const level = z.enum(["low", "medium", "high"]);
export const levelsSchema = z.object({
  calories: level,
  protein: level,
  fat: level,
  fiber: level,
  carbs: level,
});
export const preferenceSchema = z.object({
  budget: z.number().positive().max(100000),
  location: z.string().regex(/^\d{5}$/),
  age: z.number().int().positive().max(120),
  bmi: z.number().positive().max(100),
  people: z.number().int().min(1).max(30),
  meals: z.literal(3),
  diets: z.array(z.enum(DIETS)).max(5),
  allergens: z.array(z.enum(ALLERGENS)).max(9),
  cuisines: z.array(z.enum(CUISINES)).max(21),
  notes: z.string().max(3000),
  nutrientLevels: levelsSchema,
  dailyCalories: z.number().positive().max(10000).optional(),
});
export function dailyTargets(p: Preferences): Nutrition {
  const levels = p.nutrientLevels ?? {
    calories: "medium",
    protein: "medium",
    fat: "medium",
    fiber: "medium",
    carbs: "medium",
  };
  const calories =
    p.people === 1 && p.dailyCalories
      ? p.dailyCalories
      : presets.calories[levels.calories];
  return Object.fromEntries(
    nutrientKeys.map((k) => [
      k,
      k === "calories" ? calories : (presets[k][levels[k]] * calories) / 2000,
    ]),
  ) as Nutrition;
}
export const nutritionSchema = z.object({
  calories: z.number().finite().nonnegative(),
  protein: z.number().finite().nonnegative(),
  fat: z.number().finite().nonnegative(),
  fiber: z.number().finite().nonnegative(),
  carbs: z.number().finite().nonnegative(),
});
export const categories = ["breakfast", "lunch", "dinner"] as const;
export const selectionSchema = z.object({
  day: z.number().int().min(0).max(6),
  category: z.enum(categories),
  recipeId: z.string(),
  portion: z
    .number()
    .min(0.5)
    .max(2)
    .refine((n) => Number.isInteger(n * 4)),
});
export function mondayDate(localDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate))
    throw new Error("Invalid local date.");
  const d = new Date(localDate + "T12:00:00Z");
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== localDate
  )
    throw new Error("Invalid local date.");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
