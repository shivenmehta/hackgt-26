import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getMeals, getMeal } from "../../src/lib/meals/catalog";
import {
  CUISINES,
  normalizeMeal,
  recipeFingerprint,
  type RawMeal,
  type Selection,
} from "../../src/lib/meals/model";

const fixture: RawMeal = {
  idMeal: "123",
  strMeal: "Test",
  strCategory: "Vegetarian",
  strInstructions: "Cook.",
  strIngredient1: " Rice ",
  strMeasure1: " 1 cup ",
  strIngredient2: "",
  strMeasure2: "",
  strIngredient3: "Salt",
  strMeasure3: "",
  strIngredient4: "Rice",
  strMeasure4: "2 cups",
};
function selection(raw = fixture): Selection {
  return {
    id: "123",
    name: "Test",
    cuisine: "Indian",
    mealTypes: ["dinner"],
    sourceFingerprint: recipeFingerprint(raw),
  };
}
test("normalization preserves ingredient pairing, duplicate ingredients, and unknown quantities", () => {
  const meal = normalizeMeal(fixture, selection(), "2026-09-26T00:00:00Z");
  assert.deepEqual(meal.ingredients, [
    { position: 1, name: "Rice", measurement: "1 cup" },
    { position: 3, name: "Salt", measurement: null },
    { position: 4, name: "Rice", measurement: "2 cups" },
  ]);
  assert.equal(meal.servings, null);
  assert.equal(meal.nutrition, null);
  assert.equal(meal.pricing, null);
  assert.equal(meal.dietary.vegetarian, null);
});
test("rejects mismatched IDs, missing recipes, and changed source content", () => {
  assert.throws(
    () => normalizeMeal(fixture, { ...selection(), id: "456" }, "2026-09-26"),
    /ID mismatch/,
  );
  const changed = { ...fixture, strIngredient1: "Chicken" };
  assert.throws(
    () => normalizeMeal(changed, selection(), "2026-09-26"),
    /changed/,
  );
  const missing = { ...fixture, strInstructions: "" };
  assert.throws(
    () => normalizeMeal(missing, selection(missing), "2026-09-26"),
    /Missing recipe field/,
  );
});
test("catalog has 300 unique recipes and preserves full source ingredients and instructions", async () => {
  const meals = await getMeals();
  assert.equal(meals.length, 300);
  assert.equal(new Set(meals.map((m) => m.id)).size, 300);
  const counts: Record<string, number> = {};
  const selections = JSON.parse(
    await readFile("data/mealdb/selection.json", "utf8"),
  ) as Selection[];
  for (const meal of meals) {
    counts[meal.cuisine] = (counts[meal.cuisine] ?? 0) + 1;
    const wrapper = JSON.parse(
      await readFile(`data/mealdb/${meal.source.rawFile}`, "utf8"),
    );
    const entry = selections.find((s) => s.id === meal.id);
    assert.ok(entry);
    assert.deepEqual(
      normalizeMeal(wrapper.response.meals[0], entry, wrapper.fetchedAt),
      meal,
    );
    assert.ok(meal.ingredients.length);
    assert.ok(meal.instructions.length);
    if (meal.dietary.vegan === true)
      assert.equal(meal.dietary.vegetarian, true);
  }
  assert.deepEqual(counts, {
    Mexican: 6,
    Indian: 15,
    Chinese: 27,
    American: 34,
    Italian: 21,
    Japanese: 9,
    Thai: 16,
    French: 16,
    Greek: 8,
    Turkish: 16,
    Moroccan: 6,
    Spanish: 16,
    British: 16,
    Vietnamese: 16,
    Jamaican: 16,
    Canadian: 15,
    Egyptian: 8,
    Tunisian: 8,
    Polish: 15,
    Portuguese: 8,
    Filipino: 8,
  });
  const manifest = JSON.parse(
    await readFile("data/mealdb/manifest.json", "utf8"),
  );
  assert.equal(manifest.total, meals.length);
  assert.deepEqual(manifest.cuisines, counts);
  assert.deepEqual(
    manifest.entries.map((m: { id: string }) => m.id),
    meals.map((m) => m.id),
  );
});
test("diet filtering rejects source-category conflicts and unknown suitability", async () => {
  const soup = await getMeal("52955");
  assert.equal(soup?.sourceCategory, "Vegetarian");
  assert.equal(soup?.dietary.vegetarian, false);
  const vegetarian = await getMeals({ diet: "vegetarian" });
  assert.ok(vegetarian.length > 0);
  assert.ok(vegetarian.every((m) => m.dietary.vegetarian === true));
  assert.ok(!vegetarian.some((m) => m.id === "52955"));
  const vegan = await getMeals({
    cuisine: "Indian",
    diet: "vegan",
    mealType: "dinner",
  });
  assert.deepEqual(vegan.map((m) => m.id).sort(), ["52807", "52868"]);
});
test("meal type, ingredient search, empty matches and unknown IDs work offline", async () => {
  const breakfast = await getMeals({
    cuisine: "American",
    mealType: "breakfast",
  });
  assert.ok(breakfast.some((m) => m.id === "52854"));
  assert.ok(
    !(await getMeals({ mealType: "dinner" })).some((m) => m.id === "52857"),
  );
  assert.ok(
    (await getMeals({ query: "toor dal" })).some((m) => m.id === "52785"),
  );
  assert.deepEqual(await getMeals({ query: "does-not-exist-12345" }), []);
  assert.equal(await getMeal("missing"), null);
});

test("expanded cuisines can be filtered without leaking other cuisines", async () => {
  for (const cuisine of CUISINES) {
    const matches = await getMeals({ cuisine });
    assert.ok(matches.length > 0, cuisine);
    assert.ok(matches.every((meal) => meal.cuisine === cuisine));
  }
});
