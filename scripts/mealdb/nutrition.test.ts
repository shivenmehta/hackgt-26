import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateNutrition,
  convertQuantity,
  readNutrients,
  type NutritionFood,
  type IngredientMatch,
} from "../../src/lib/meals/nutrition";
import { getEnrichedMeals } from "../../src/lib/meals/enriched-catalog";
const food: NutritionFood = {
  fdcId: 1,
  description: "Test food raw",
  dataType: "Foundation",
  nutrients: { caloriesKcal: 200, proteinG: 10, fatG: 5 },
  caloriesIsEstimate: false,
  calorieProvenance: null,
  sourceFile: "fixture",
  portions: [
    { id: 1, amount: 1, gramWeight: 120, measureUnit: { name: "cup" } },
  ],
  portionSourceFdcId: 1,
};
const match: IngredientMatch = { food, kind: "direct", notes: "Test fixture" };
const row = (name: string, measurement: string | null, position = 1) => ({
  name,
  measurement,
  position,
});
test("mass conversions handle fractions, Unicode, packages and explicit gram equivalents", () => {
  for (const [text, expected] of [
    ["200g", 200],
    ["1.5 kg", 1500],
    ["½ lb", 226.796185],
    ["1 1/2 oz", 42.5242846875],
    ["2 x 400g tins", 800],
    ["4 tablespoons (55 grams)", 55],
    ["50g/2oz", 50],
  ] as const) {
    const result = convertQuantity(text, food, "test");
    assert.equal(result.method, "explicit-mass");
    assert.ok(Math.abs(result.grams - expected) < 0.000001, text);
  }
});
test("cups use food-specific USDA weights, not a universal 100g conversion", () => {
  assert.equal(convertQuantity("2 cups", food, "test").grams, 240);
  assert.equal(convertQuantity("½ cup", food, "test").grams, 60);
  assert.equal(convertQuantity("2½ tbsp", food, "test").grams, 18.75);
  const garlic = {
    ...food,
    portions: [
      {
        id: 2,
        amount: 1,
        gramWeight: 3,
        modifier: "clove",
        measureUnit: { name: "undetermined" },
      },
    ],
  };
  assert.equal(convertQuantity("2 cloves minced", garlic, "garlic").grams, 6);
});
test("unresolved measurements use an explicit 100g assumption, never a silent zero", () => {
  for (const text of [
    null,
    "1 jar",
    "to taste",
    "1-2 cups",
    "1 cup plus extra",
  ]) {
    const q = convertQuantity(text, food, "test");
    assert.equal(q.grams, 100);
    assert.equal(q.method, "assumed-100g");
  }
  const result = calculateNutrition(
    [row("test", "1 jar")],
    new Map([["test", match]]),
  );
  assert.equal(result.status, "assumed-quantities");
  assert.equal(result.totals.caloriesKcal, 200);
  assert.equal(result.knownSubtotal.caloriesKcal, null);
});
test("ingredient totals use per-100g values and aggregate before rounding", () => {
  const result = calculateNutrition(
    [row("test", "200g"), row("test", "50g", 2)],
    new Map([["test", match]]),
  );
  assert.deepEqual(result.totals, {
    caloriesKcal: 500,
    proteinG: 25,
    fatG: 12.5,
  });
  assert.equal(result.perServing, null);
  assert.equal(result.status, "calculated-estimate");
});
test("unmatched ingredients and absent nutrients make full totals null but preserve partial sums", () => {
  const result = calculateNutrition(
    [row("test", "100g"), row("unknown", "100g", 2)],
    new Map([["test", match]]),
  );
  assert.equal(result.status, "partial");
  assert.equal(result.totals.caloriesKcal, null);
  assert.equal(result.estimatedSubtotal.caloriesKcal, 200);
  const missing = {
    ...match,
    food: { ...food, nutrients: { ...food.nutrients, proteinG: null } },
  };
  const result2 = calculateNutrition(
    [row("test", "100g")],
    new Map([["test", missing]]),
  );
  assert.equal(result2.totals.proteinG, null);
  assert.equal(result2.totals.fatG, 5);
});
test("cooked and raw foods are not silently mixed", () => {
  const result = calculateNutrition(
    [row("test", "200g cooked")],
    new Map([["test", match]]),
  );
  assert.equal(result.ingredients[0].quantity, null);
  assert.equal(result.totals.caloriesKcal, null);
});
test("nutrient parsing supports full and abridged USDA, energy priority, zero and sourced fallback", () => {
  const n = readNutrients({
    fdcId: 1,
    foodNutrients: [
      { nutrient: { number: "957", unitName: "kcal" }, amount: 150 },
      { nutrient: { number: "208", unitName: "kcal" }, amount: 160 },
      { nutrient: { number: "203", unitName: "g" }, amount: 0 },
    ],
  });
  assert.equal(n.nutrients.caloriesKcal, 160);
  assert.equal(n.nutrients.proteinG, 0);
  assert.equal(n.nutrients.fatG, null);
  const fallback = readNutrients({
    food: { fdcId: 1, foodNutrients: [] },
    nutritionFallbacks: {
      energy: {
        amount: 0,
        unitName: "KCAL",
        basisGrams: 100,
        isEstimate: true,
      },
    },
  });
  assert.equal(fallback.nutrients.caloriesKcal, 0);
  assert.equal(fallback.caloriesIsEstimate, true);
  assert.throws(
    () =>
      readNutrients({
        foodNutrients: [{ number: "203", amount: 3, unitName: "mg" }],
      }),
    /unit/,
  );
});
test("all 300 enriched meals retain original recipe fields and expose coverage honestly", async () => {
  const originals = JSON.parse(
    await readFile("data/mealdb/meals.json", "utf8"),
  ).meals;
  const meals = await getEnrichedMeals();
  assert.equal(meals.length, 300);
  assert.equal(new Set(meals.map((m) => m.id)).size, 300);
  for (let i = 0; i < meals.length; i++) {
    const { nutrition, ...recipe } = meals[i];
    const { nutrition: oldNutrition, ...original } = originals[i];
    assert.equal(oldNutrition, null);
    assert.deepEqual(recipe, original);
    assert.equal(nutrition.ingredients.length, recipe.ingredients.length);
    for (const key of ["caloriesKcal", "proteinG", "fatG"] as const) {
      if (nutrition.coverage.nutrients[key].missing > 0)
        assert.equal(nutrition.totals[key], null);
    }
    for (const ingredient of nutrition.ingredients)
      if (ingredient.quantity?.method === "assumed-100g")
        assert.equal(ingredient.quantity.grams, 100);
  }
  assert.ok(
    (await getEnrichedMeals({ cuisine: "Indian" })).every(
      (m) => m.cuisine === "Indian",
    ),
  );
});
