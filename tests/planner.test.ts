import test from "node:test";
import assert from "node:assert/strict";
import {
  initialDraft,
  validatePreferences,
  parsePreferences,
  buildSamplePlan,
  isEligible,
  perServingCents,
  type Preferences,
} from "../src/lib/planner";
import { sampleRecipes } from "../src/lib/sample-recipes";
const prefs: Preferences = {
  ...parsePreferences({
    ...initialDraft,
    location: "Atlanta",
    age: "24",
    bmi: "22",
  }),
};
const now = new Date(2026, 8, 27, 12);
test("validates required fields, positivity, finite numbers and whole numbers", () => {
  assert.deepEqual(
    validatePreferences({
      ...initialDraft,
      location: "Atlanta",
      age: "24",
      bmi: "22",
    }),
    {},
  );
  for (const key of [
    "budget",
    "location",
    "age",
    "bmi",
    "people",
    "meals",
  ] as const)
    assert.ok(
      validatePreferences({
        ...initialDraft,
        location: "Atlanta",
        age: "24",
        bmi: "22",
        [key]: "",
      })[key],
    );
  for (const key of ["age", "people", "meals"] as const)
    assert.ok(validatePreferences({ ...initialDraft, [key]: "1.5" })[key]);
  assert.ok(
    validatePreferences({ ...initialDraft, budget: "Infinity" }).budget,
  );
  assert.ok(validatePreferences({ ...initialDraft, bmi: "0" }).bmi);
  assert.ok(validatePreferences({ ...initialDraft, meals: "7" }).meals);
  assert.throws(() => parsePreferences(initialDraft));
});
test("Monday through Sunday, 1–6 slots, deterministic selection", () => {
  for (let meals = 1; meals <= 6; meals++) {
    const p = { ...prefs, meals };
    const plan = buildSamplePlan(p, sampleRecipes, now);
    assert.equal(plan.days[0].date, "2026-09-21");
    assert.equal(plan.days[6].date, "2026-09-27");
    assert.equal(plan.days.length, 7);
    assert.ok(plan.days.every((d) => d.meals.length === meals));
    assert.deepEqual(plan, buildSamplePlan(p, sampleRecipes, now));
  }
});
test("hard dietary and allergen filters never relax for cuisine", () => {
  const p: Preferences = {
    ...prefs,
    diets: ["Vegan", "Gluten-free"],
    allergens: ["Soy", "Sesame", "Tree nuts"],
    cuisines: ["Mediterranean"],
  };
  const plan = buildSamplePlan(p, sampleRecipes, now);
  assert.equal(plan.days.length, 7);
  for (const day of plan.days)
    for (const m of day.meals) {
      assert.ok(isEligible(m.recipe, p));
      assert.equal(m.recipe.kind, "vegan");
    }
});
test("unavailable combinations return an empty plan, without relaxing filters", () => {
  const p: Preferences = { ...prefs, diets: ["Vegan"] };
  const plan = buildSamplePlan(
    p,
    sampleRecipes.filter((r) => r.kind === "meat"),
    now,
  );
  assert.deepEqual(plan.days, []);
  assert.equal(plan.totalCents, 0);
});
test("household cost scales while per-serving cost stays constant; overages are preserved", () => {
  const one = buildSamplePlan({ ...prefs, budget: 1 }, sampleRecipes, now);
  const four = buildSamplePlan({ ...prefs, people: 4 }, sampleRecipes, now);
  assert.equal(four.totalCents, one.totalCents * 4);
  assert.ok(one.totalCents > 100);
  const sum = one.days
    .flatMap((d) => d.meals)
    .reduce((n, m) => n + perServingCents(m.recipe), 0);
  assert.equal(one.totalCents, sum);
});
test("age, BMI, location and notes do not alter sample meal choices", () => {
  const a = buildSamplePlan(prefs, sampleRecipes, now);
  const b = buildSamplePlan(
    { ...prefs, age: 60, bmi: 31, location: "Other city", notes: "No cooking" },
    sampleRecipes,
    now,
  );
  assert.deepEqual(a.days, b.days);
  assert.equal(a.totalCents, b.totalCents);
});
