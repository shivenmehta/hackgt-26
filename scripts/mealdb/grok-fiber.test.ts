import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateEstimates,
  summarize,
  inputHash,
  validCache,
  PROMPT_VERSION,
  type FiberMeal,
  type EstimateRecord,
} from "../../src/lib/meals/grok-fiber";
const meal: FiberMeal = {
  ...JSON.parse(readFileSync("data/mealdb/meals.json", "utf8")).meals[0],
  previousEstimates: [],
};
const estimates = meal.ingredients.map((i) => ({
  position: i.position,
  carbsG: 10,
  fiberG: 2,
  assumptions: "Fixture",
}));
const record: EstimateRecord = {
  inputHash: inputHash(meal, "test"),
  requestedModel: "test",
  model: "test",
  createdAt: new Date().toISOString(),
  promptVersion: PROMPT_VERSION,
  estimates,
};
test("sums whole ingredient quantities with fiber included in total carbs", () => {
  const r = summarize(meal, record);
  assert.equal(r.carbsG, 10 * meal.ingredients.length);
  assert.equal(r.fiberG, 2 * meal.ingredients.length);
  assert.equal(r.status, "estimated");
});
test("unknown and zero remain distinct", () => {
  const r = summarize(meal, {
    ...record,
    estimates: estimates.map((e) => ({ ...e, carbsG: null, fiberG: 0 })),
  });
  assert.equal(r.carbsG, null);
  assert.equal(r.fiberG, 0);
  assert.equal(r.status, "partial");
});
test("rejects malformed, duplicate or implausible nutrient contributions", () => {
  for (const edit of [
    { fiberG: 11 },
    { carbsG: -1 },
    { fiberG: Infinity },
    { position: 9999 },
    { assumptions: "" },
  ])
    assert.throws(() =>
      validateEstimates(
        {
          ingredients: estimates.map((e, i) =>
            i === 0 ? { ...e, ...edit } : e,
          ),
        },
        meal.ingredients,
      ),
    );
  assert.throws(() =>
    validateEstimates({ ingredients: estimates.slice(1) }, meal.ingredients),
  );
});
test("earlier macro assumptions are part of the cache key", () => {
  assert.equal(validCache(record, meal, "test"), true);
  assert.equal(
    validCache(
      record,
      {
        ...meal,
        previousEstimates: [
          {
            position: 1,
            caloriesKcal: 5,
            proteinG: 1,
            fatG: 0,
            assumptions: "new weight",
          },
        ],
      },
      "test",
    ),
    false,
  );
});

test("inconsistent fiber/carbs pairs become unknown without changing other entries", async () => {
  const { rejectInconsistentPairs } =
    await import("../../src/lib/meals/grok-fiber");
  const raw = {
    ingredients: estimates.map((e, i) =>
      i === 0 ? { ...e, carbsG: 1, fiberG: 2 } : e,
    ),
  };
  const validated = validateEstimates(
    rejectInconsistentPairs(raw),
    meal.ingredients,
  );
  assert.equal(validated[0].carbsG, null);
  assert.equal(validated[0].fiberG, null);
  assert.match(validated[0].assumptions, /Rejected/);
  assert.equal(validated[1].carbsG, 10);
});
