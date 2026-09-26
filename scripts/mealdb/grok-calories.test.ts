import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  targetsFor,
  validateEstimates,
  inputHash,
  validCache,
  calorieOverlay,
  PROMPT_VERSION,
  type EstimateRecord,
} from "../../src/lib/meals/grok-calories";
import type { EnrichedMeal } from "../../src/lib/meals/enriched-catalog";
const { meals } = JSON.parse(
  readFileSync("data/combined/meals.json", "utf8"),
) as { meals: EnrichedMeal[] };
const meal = meals.find((m) => targetsFor(m).length > 1)!;
const targets = targetsFor(meal);
const estimates = targets.map((t) => ({
  position: t.position,
  grams: t.knownGrams ?? 15,
  caloriesPer100g: t.knownCaloriesPer100g ?? 200,
  assumptions: "Test fixture estimate",
}));
const record: EstimateRecord = {
  inputHash: inputHash(meal, "test-model"),
  requestedModel: "test-model",
  model: "test-model",
  promptVersion: PROMPT_VERSION,
  createdAt: "2026-09-26T00:00:00Z",
  estimates,
};
test("targets only problematic calories in the 190 partial recipes", () => {
  assert.equal(
    meals.filter((m) => m.nutrition.status === "partial").length,
    190,
  );
  for (const m of meals) {
    const t = targetsFor(m);
    if (m.nutrition.status !== "partial") assert.equal(t.length, 0);
    for (const r of m.nutrition.ingredients)
      assert.equal(
        t.some((t) => t.position === r.position),
        m.nutrition.status === "partial" &&
          (r.nutrients.caloriesKcal === null ||
            r.quantity?.method === "assumed-100g"),
      );
  }
});
test("response rejects missing/duplicate IDs, invalid numbers, malformed values, and missing explanations", () => {
  assert.throws(() => validateEstimates({ ingredients: [] }, targets));
  for (const change of [
    { position: 999 },
    { grams: -1 },
    { grams: Infinity },
    { caloriesPer100g: 1001 },
    { grams: "10" },
    { assumptions: "" },
  ])
    assert.throws(() =>
      validateEstimates(
        {
          ingredients: estimates.map((e, i) =>
            i === 0 ? { ...e, ...change } : e,
          ),
        },
        targets,
      ),
    );
  assert.throws(() =>
    validateEstimates(
      {
        ingredients: estimates.map((e, i) =>
          i === 1 ? { ...e, position: estimates[0].position } : e,
        ),
      },
      targets,
    ),
  );
});
test("sourced zero and quantities cannot be overwritten by Grok", () => {
  const fixed = [
    {
      position: 1,
      name: "salt",
      measurement: "2g",
      knownGrams: 2,
      knownCaloriesPer100g: 0,
    },
  ];
  assert.deepEqual(
    validateEstimates(
      {
        ingredients: [
          {
            position: 1,
            grams: 100,
            caloriesPer100g: 400,
            assumptions: "wrong values",
          },
        ],
      },
      fixed,
    )[0],
    { position: 1, grams: 2, caloriesPer100g: 0, assumptions: "wrong values" },
  );
});
test("cache invalidates model, recipe, quantity and source changes", () => {
  assert.ok(validCache(record, meal, "test-model"));
  assert.ok(!validCache(record, meal, "other"));
  const changed = structuredClone(meal);
  changed.instructions += " Changed";
  assert.ok(!validCache(record, changed, "test-model"));
  assert.ok(!validCache({ ...record, estimates: [] }, meal, "test-model"));
});
test("overlay preserves original nutrition, sums each ingredient once and labels every estimate", () => {
  const snapshot = JSON.stringify(meal);
  const result = calorieOverlay(meal, record);
  assert.equal(result.coverage.missing, 0);
  assert.equal(result.coverage.grokEstimated, targets.length);
  assert.ok(result.totalCaloriesKcal !== null);
  assert.equal(JSON.stringify(meal), snapshot);
  for (const r of meal.nutrition.ingredients) {
    const out = result.ingredients.find((i) => i.position === r.position)!;
    if (!targets.some((t) => t.position === r.position))
      assert.equal(out.caloriesKcal, r.nutrients.caloriesKcal);
  }
  const expected = meal.nutrition.ingredients.reduce((sum, r) => {
    const e = estimates.find((e) => e.position === r.position);
    return (
      sum +
      (e ? (e.grams * e.caloriesPer100g) / 100 : r.nutrients.caloriesKcal!)
    );
  }, 0);
  assert.equal(
    result.totalCaloriesKcal,
    Math.round((expected + Number.EPSILON) * 100) / 100,
  );
});
test("absent or null estimates stay partial, never silently zero or the old 100g placeholder", () => {
  assert.equal(calorieOverlay(meal).totalCaloriesKcal, null);
  const missing = {
    ...record,
    estimates: estimates.map((e) => ({
      ...e,
      grams: null,
      caloriesPer100g: null,
    })),
  };
  const result = calorieOverlay(meal, missing);
  assert.equal(result.totalCaloriesKcal, null);
  assert.ok(result.coverage.missing > 0);
});

test("saved catalog preserves every base field and exposes the enriched server loader", async () => {
  const { getGrokEnrichedMeals } =
    await import("../../src/lib/meals/enriched-catalog");
  const { existsSync } = await import("node:fs");
  if (!existsSync("data/combined/meals-grok.json")) return;
  const enriched = await getGrokEnrichedMeals();
  assert.equal(enriched.length, meals.length);
  for (const original of meals) {
    const actual = enriched.find((m) => m.id === original.id)!;
    const { grokCalories, ...originalNutrition } = actual.nutrition;
    assert.deepEqual({ ...actual, nutrition: originalNutrition }, original);
    if (original.nutrition.status !== "partial")
      assert.equal(grokCalories, null);
    else {
      assert.ok(grokCalories);
      assert.equal(
        grokCalories.coverage.ingredients,
        original.ingredients.length,
      );
      assert.equal(
        grokCalories.totalCaloriesKcal === null,
        grokCalories.coverage.missing > 0,
      );
      assert.equal(
        grokCalories.ingredients.length,
        original.ingredients.length,
      );
    }
  }
});
