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
  PROMPT_VERSION,
  type EstimateRecord,
} from "../../src/lib/meals/grok-full-nutrition";
const meal = (
  JSON.parse(readFileSync("data/mealdb/meals.json", "utf8")) as {
    meals: CatalogMeal[];
  }
).meals[0];
const estimates = meal.ingredients.map((i) => ({
  position: i.position,
  caloriesKcal: 100,
  proteinG: 5,
  fatG: 3,
  assumptions: "Test quantity estimate",
}));
const record: EstimateRecord = {
  inputHash: inputHash(meal, "test"),
  requestedModel: "test",
  model: "test",
  createdAt: new Date().toISOString(),
  promptVersion: PROMPT_VERSION,
  estimates,
};
test("whole-recipe macros sum each ingredient once without USDA data", () => {
  const r = summarize(meal, record);
  assert.equal(r.caloriesKcal, meal.ingredients.length * 100);
  assert.equal(r.proteinG, meal.ingredients.length * 5);
  assert.equal(r.fatG, meal.ingredients.length * 3);
  assert.equal(r.status, "estimated");
  assert.ok(!("nutrition" in requestInput(meal)));
});
test("missing nutrients remain null independently, sourced zero remains zero", () => {
  const entries = estimates.map((e) => ({ ...e, proteinG: null, fatG: 0 }));
  const r = summarize(meal, { ...record, estimates: entries });
  assert.equal(r.proteinG, null);
  assert.equal(r.fatG, 0);
  assert.equal(r.caloriesKcal, meal.ingredients.length * 100);
  assert.equal(r.status, "partial");
  assert.equal(summarize(meal).status, "pending");
});
test("response validates exact identities, nonnegative finite macros and assumptions", () => {
  for (const change of [
    { position: 9999 },
    { caloriesKcal: -1 },
    { fatG: "3" },
    { proteinG: Infinity },
    { assumptions: "" },
  ])
    assert.throws(() =>
      validateEstimates(
        {
          ingredients: estimates.map((e, i) =>
            i === 0 ? { ...e, ...change } : e,
          ),
        },
        meal.ingredients,
      ),
    );
  assert.throws(() =>
    validateEstimates({ ingredients: estimates.slice(1) }, meal.ingredients),
  );
  assert.throws(() =>
    validateEstimates(
      {
        ingredients: estimates.map((e, i) =>
          i === 1 ? { ...e, position: estimates[0].position } : e,
        ),
      },
      meal.ingredients,
    ),
  );
});
test("cache changes when recipe or model changes", () => {
  assert.equal(validCache(record, meal, "test"), true);
  assert.equal(validCache(record, meal, "other"), false);
  assert.equal(
    validCache(
      record,
      { ...meal, instructions: meal.instructions + " new" },
      "test",
    ),
    false,
  );
  assert.equal(validCache({ ...record, estimates: [] }, meal, "test"), false);
});
