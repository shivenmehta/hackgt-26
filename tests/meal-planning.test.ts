import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  initialDraft,
  parsePreferences,
  validatePreferences,
} from "../src/lib/planner";
import {
  dailyTargets,
  mondayDate,
  categories,
} from "../src/lib/meal-planning/validation";
import {
  allowed,
  readPrepared,
  servingNutrition,
} from "../src/lib/meal-planning/catalog";
import {
  packageGrams,
  distanceMiles,
  priceRecipe,
} from "../src/lib/meal-planning/pricing";
import {
  deterministicSelections,
  repairBudget,
  buildWeeklyPlan,
  validateSelections,
  mealCost,
} from "../src/lib/meal-planning/assembly";
import { session, setSession } from "../src/lib/meal-planning/http";
import { NextRequest, NextResponse } from "next/server";
import { ingredientPriceKey } from "../src/lib/meal-planning/types";
import type {
  PreparedMeal,
  Price,
  Rankings,
  PlanSnapshot,
} from "../src/lib/meal-planning/types";
const p = parsePreferences({
  ...initialDraft,
  location: "30318",
  age: "24",
  bmi: "22",
});
export const fixture: PreparedMeal = {
  id: "one",
  name: "Chickpea rice bowl",
  cuisine: "Indian",
  fingerprint: "fixture",
  yield: 4,
  minutes: 25,
  categories: ["breakfast", "lunch", "dinner"],
  diets: {
    Vegan: true,
    Vegetarian: true,
    Pescatarian: true,
    "Gluten-free": true,
    "Dairy-free": true,
  },
  allergens: {
    Milk: false,
    Eggs: false,
    Fish: false,
    Shellfish: false,
    "Tree nuts": false,
    Peanuts: false,
    Wheat: false,
    Soy: false,
    Sesame: false,
  },
  assumptions: ["Fixture only"],
  instructions: "Cook the rice.\nCombine with chickpeas.",
  imageUrl: "",
  nutrition: { calories: 2400, protein: 100, fat: 60, fiber: 40, carbs: 360 },
  ingredients: [
    {
      position: 1,
      name: "rice",
      measurement: "400 g",
      grams: 400,
      assumptions: "dry weight",
    },
    {
      position: 2,
      name: "chickpeas",
      measurement: "800 g",
      grams: 800,
      assumptions: "cooked weight",
    },
  ],
};
const price: Price = {
  source: "grok-average",
  storeId: "01100346",
  centsPerGram: 1,
  description: "fixture",
  assumptions: "test only",
  fetchedAt: "2026-09-26T00:00:00Z",
};
const recipes = [
  priceRecipe(fixture, [price, price]),
  priceRecipe({ ...fixture, id: "two", name: "Second bowl" }, [
    { ...price, centsPerGram: 0.5 },
    { ...price, centsPerGram: 0.5 },
  ]),
];
function rank(): Rankings {
  const payload = {
    schemaVersion: 1,
    catalog: recipes.map((r) => ({ id: r.id, nutrition: servingNutrition(r) })),
    eligible: recipes.map((r) => ({ id: r.id, categories: r.categories })),
    dailyTargets: dailyTargets(p),
  };
  const run = spawnSync(
    "python3",
    [
      "-c",
      "import sys,json;sys.path.insert(0,'services/recipe-ranker');from ranker import rank;print(json.dumps(rank(json.load(sys.stdin))))",
    ],
    { input: JSON.stringify(payload), encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout).rankings;
}
export function snapshot(): PlanSnapshot {
  const rankings = rank();
  return {
    preferences: p,
    recipes,
    rankings,
    selections: deterministicSelections(rankings),
    weekStart: "2026-09-21",
    store: { id: "01100346", name: "Reference Kroger", reference: true },
    warnings: [],
  };
}
test("households ignore manual calorie targets; single-person override works", () => {
  assert.equal(
    dailyTargets({ ...p, people: 1, dailyCalories: 2100 }).calories,
    2100,
  );
  assert.equal(
    dailyTargets({ ...p, people: 4, dailyCalories: 9000 }).calories,
    2000,
  );
  assert.equal(
    dailyTargets({ ...p, people: 4, dailyCalories: 9000 }).protein,
    100,
  );
  assert.ok(
    validatePreferences({ ...initialDraft, location: "Atlanta" }).location,
  );
  assert.ok(validatePreferences({ ...initialDraft, meals: "6" }).meals);
});
test("hard filters include unknown exclusions and gluten independent of wheat", () => {
  assert.equal(allowed(fixture, { ...p, cuisines: ["Mexican"] }), false);
  assert.equal(
    allowed(
      { ...fixture, allergens: { ...fixture.allergens, Milk: null } },
      { ...p, allergens: ["Milk"] },
    ),
    false,
  );
  assert.equal(
    allowed(
      { ...fixture, diets: { ...fixture.diets, "Gluten-free": false } },
      { ...p, diets: ["Gluten-free"] },
    ),
    false,
  );
  assert.equal(allowed(fixture, p, ["chickpea"]), false);
  assert.equal(
    allowed(fixture, { ...p, diets: ["Vegan"], allergens: ["Milk"] }),
    true,
  );
});
test("package mass conversion does not guess fluid ounces or counts", () => {
  assert.equal(packageGrams("2 x 400 g"), 800);
  assert.equal(packageGrams("1 kg"), 1000);
  assert.ok(Math.abs(packageGrams("16 oz")! - 453.59237) < 0.00001);
  assert.equal(packageGrams("12 fl oz"), null);
  assert.equal(packageGrams("6 ct"), null);
  assert.equal(
    distanceMiles(
      { latitude: 33, longitude: -84 },
      { latitude: 33, longitude: -84 },
    ),
    0,
  );
});
test("nutrition divides by recipe yield and price uses consumed grams", () => {
  assert.equal(servingNutrition(fixture).calories, 600);
  assert.equal(recipes[0].perServingCents, 300);
  assert.equal(mealCost(recipes[0], 0.5, 4), 600);
  assert.throws(() => priceRecipe(fixture, [price]));
  assert.throws(() =>
    priceRecipe(fixture, [price, { ...price, centsPerGram: 0 }]),
  );
});
test("Python contract produces complete deterministic rankings and 21 dated slots", () => {
  const s = snapshot();
  const plan = buildWeeklyPlan(s);
  assert.equal(plan.days.length, 7);
  assert.equal(plan.days[6].date, "2026-09-27");
  assert.equal(plan.days.flatMap((d) => d.meals).length, 21);
  assert.deepEqual(s.rankings, rank());
  for (const c of categories) assert.equal(s.rankings[c].length, 2);
  assert.equal(mondayDate("2026-09-27"), "2026-09-21");
  assert.throws(() => mondayDate("2026-02-30"));
});
test("invalid AI selections cannot invent recipes, portions or duplicate slots", () => {
  const s = snapshot();
  for (const invalid of [
    { ...s.selections[0], recipeId: "invented" },
    { ...s.selections[0], portion: 3 },
    { ...s.selections[0], day: 1 },
  ])
    assert.throws(() =>
      validateSelections(
        [invalid, ...s.selections.slice(1)],
        s.recipes,
        s.rankings,
      ),
    );
});
test("budget repair finds affordable substitutions and reports impossible budgets with real costs", () => {
  const s = snapshot();
  s.selections = repairBudget(s.selections, s.recipes, s.rankings, 1, 2000);
  assert.ok(buildWeeklyPlan(s).totalCents <= 2000);
  s.selections = repairBudget(s.selections, s.recipes, s.rankings, 1, 1);
  assert.equal(buildWeeklyPlan(s).totalCents, 21 * 75);
  assert.ok(
    s.selections.every((x) => x.recipeId === "two" && x.portion === 0.5),
  );
});
test("household quantities and nutrition scale without changing per-person figures", () => {
  const s = snapshot(),
    one = buildWeeklyPlan(s),
    four = buildWeeklyPlan({
      ...s,
      preferences: { ...s.preferences, people: 4 },
    });
  assert.equal(four.totalCents, one.totalCents * 4);
  assert.deepEqual(
    four.days[0].meals[0].recipe.nutrition,
    one.days[0].meals[0].recipe.nutrition,
  );
});
test("signed sessions reject tampering and use secure httpOnly cookie ownership", () => {
  process.env.PLANNER_SESSION_SECRET =
    "test-secret-with-more-than-thirty-two-characters";
  const owner = session(new NextRequest("http://localhost/api/plans"), true)!;
  assert.equal(
    session(
      new NextRequest("http://localhost", {
        headers: { cookie: `bridge-planner-session=${owner.cookie}` },
      }),
    )?.owner,
    owner.owner,
  );
  assert.equal(
    session(
      new NextRequest("http://localhost", {
        headers: {
          cookie: `bridge-planner-session=${owner.cookie.slice(0, -1)}x`,
        },
      }),
    ),
    null,
  );
  const response = setSession(NextResponse.json({}), owner.cookie);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
});
test("prepared catalog preserves all 300 IDs, gram assumptions and source totals", async () => {
  const meals = await readPrepared();
  assert.equal(meals.length, 300);
  assert.equal(new Set(meals.map((m) => m.id)).size, 300);
  for (const m of meals) {
    assert.ok(m.yield > 0);
    assert.ok(m.ingredients.every((i) => i.grams > 0 && i.assumptions));
  }
});

test("ingredient prices deduplicate quantities without mixing cooked and dry states", () => {
  const a = {
    name: "Rice",
    measurement: "100g",
    assumptions: "dry white rice",
  };
  assert.equal(
    ingredientPriceKey(a),
    ingredientPriceKey({ ...a, measurement: "200g" }),
  );
  assert.notEqual(
    ingredientPriceKey(a),
    ingredientPriceKey({ ...a, assumptions: "cooked white rice" }),
  );
});
