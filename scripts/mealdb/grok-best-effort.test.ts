import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CatalogMeal } from "../../src/lib/meals/model";
import {
  validateEstimates,
  summarize,
  inputHash,
  validCache,
  requestInput,
  KEYS,
  PROMPT_VERSION,
  type EstimateRecord,
} from "../../src/lib/meals/grok-best-effort";
const meal = (
  JSON.parse(readFileSync("data/mealdb/meals.json", "utf8")) as {
    meals: CatalogMeal[];
  }
).meals[0];
const raw = {
  ingredients: meal.ingredients.map((i) => ({
    position: i.position,
    grams: 200,
    per100g: {
      caloriesKcal: 200,
      proteinG: 10,
      fatG: 5,
      carbsG: 25,
      fiberG: 3,
    },
    assumptions: "Typical recipe-specific amount",
  })),
};
const estimates = validateEstimates(raw, meal.ingredients);
const record: EstimateRecord = {
  inputHash: inputHash(meal, "test"),
  requestedModel: "test",
  model: "test",
  createdAt: new Date().toISOString(),
  promptVersion: PROMPT_VERSION,
  estimates,
};
test("all five whole-recipe totals are computed locally from grams and densities", () => {
  const r = summarize(meal, record);
  for (const k of KEYS)
    assert.equal(
      r[k as keyof typeof r],
      meal.ingredients.length * 2 * raw.ingredients[0].per100g[k],
    );
  assert.equal(r.status, "estimated");
  assert.ok(
    estimates.every((e) =>
      Object.values(e.nutrientSources).every((s) => s === "grok-estimate"),
    ),
  );
});
test("prompt inputs contain only recipe fields, no USDA or prior nutrition", () => {
  assert.deepEqual(
    Object.keys(requestInput(meal)).sort(),
    ["id", "name", "cuisine", "instructions", "ingredients"].sort(),
  );
  assert.equal(requestInput(meal).ingredients, meal.ingredients);
});
test("rejects nulls, nonfinite/negative values, invalid identities and fiber exceeding carbs", () => {
  for (const per100g of [
    { ...raw.ingredients[0].per100g, proteinG: null },
    { ...raw.ingredients[0].per100g, fatG: -1 },
    { ...raw.ingredients[0].per100g, carbsG: Infinity },
    { ...raw.ingredients[0].per100g, fiberG: 30 },
  ])
    assert.throws(() =>
      validateEstimates(
        {
          ingredients: raw.ingredients.map((e, i) =>
            i === 0 ? { ...e, per100g } : e,
          ),
        },
        meal.ingredients,
      ),
    );
  assert.throws(() =>
    validateEstimates(
      { ingredients: raw.ingredients.slice(1) },
      meal.ingredients,
    ),
  );
  assert.throws(() =>
    validateEstimates(
      {
        ingredients: raw.ingredients.map((e, i) =>
          i === 1 ? { ...e, position: raw.ingredients[0].position } : e,
        ),
      },
      meal.ingredients,
    ),
  );
});
test("cache invalidates on recipe/model changes; pending is never a zero estimate", () => {
  assert.ok(validCache(record, meal, "test"));
  assert.equal(validCache(record, meal, "other"), false);
  assert.equal(
    validCache(record, { ...meal, instructions: "changed" }, "test"),
    false,
  );
  assert.equal(summarize(meal).status, "pending");
  for (const k of KEYS)
    assert.equal(
      summarize(meal)[k as keyof ReturnType<typeof summarize>],
      null,
    );
});
