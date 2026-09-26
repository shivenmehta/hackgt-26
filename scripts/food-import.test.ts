import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { toFoodRow, sqlJson, splitSqlBatches } from "./usda/food-import";
const base = new URL("../data/usda/", import.meta.url);
const fixture = (foodNutrients: unknown[] = []) => ({
  name: "Example",
  source: "USDA FoodData Central",
  fetchedAt: "2026-09-25T00:00:00Z",
  food: {
    fdcId: 1,
    description: "Example",
    dataType: "Foundation",
    foodNutrients,
  },
});
const n = (number: string, amount: number, unitName = "G") => ({
  number,
  amount,
  unitName,
});

test("maps by number, preserves zero, and leaves absent amounts unknown", () => {
  const row = toFoodRow(
    fixture([
      n("307", 0, "MG"),
      n("203", 12),
      { number: "291", unitName: "G" },
    ]),
    1,
    "Example",
  );
  assert.equal(row.protein_g_per_100g, 12);
  assert.equal(row.sodium_mg_per_100g, 0);
  assert.equal(row.fiber_g_per_100g, null);
  assert.equal(row.calories_kcal_per_100g, null);
  assert.equal(row.calories_is_estimate, null);
  assert.equal(row.calorie_provenance, null);
});
test("energy precedence is 208, 957, 958 regardless of array order", () => {
  for (const [ns, expected] of [
    [[n("958", 90, "KCAL"), n("957", 100, "KCAL"), n("208", 110, "KCAL")], 110],
    [[n("958", 90, "KCAL"), n("957", 100, "KCAL")], 100],
    [[n("958", 90, "KCAL")], 90],
  ] as const) {
    assert.equal(
      toFoodRow(fixture([...ns]), 1, "Example").calories_kcal_per_100g,
      expected,
    );
  }
});
test("rejects wrong units, duplicate nutrients, negative amounts and mismatched identity", () => {
  for (const ns of [
    [n("203", 12, "MG")],
    [n("203", 1), n("203", 2)],
    [n("203", -1)],
    [n("203", Infinity)],
  ])
    assert.throws(() => toFoodRow(fixture(ns), 1, "Example"));
  assert.throws(() => toFoodRow(fixture(), 2, "Example"));
  assert.throws(() => toFoodRow(fixture(), 1, "Different food"));
});
test("salt fallback preserves sourced zero and native energy takes precedence", async () => {
  const salt = JSON.parse(
    await readFile(new URL("foundation/salt-iodized.json", base), "utf8"),
  );
  const before = JSON.stringify(salt);
  const row = toFoodRow(salt, 746775, salt.food.description.trim());
  assert.equal(row.calories_kcal_per_100g, 0);
  assert.equal(row.calories_is_estimate, true);
  assert.deepEqual(row.calorie_provenance, salt.nutritionFallbacks.energy);
  assert.equal(JSON.stringify(salt), before);
  salt.food.foodNutrients.push(n("208", 0, "KCAL"));
  assert.equal(
    toFoodRow(salt, 746775, salt.food.description.trim()).calories_is_estimate,
    false,
  );
  salt.food.foodNutrients.pop();
  salt.nutritionFallbacks.energy.basisGrams = 50;
  assert.throws(() => toFoodRow(salt, 746775, salt.food.description.trim()));
});
test("all 300 catalog records map, with 12 estimates and 38 unknown calorie values", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("foundation-manifest.json", base), "utf8"),
  ) as { file: string; fdcId: number; name: string }[];
  const rows = await Promise.all(
    manifest.map(async (e) =>
      toFoodRow(
        JSON.parse(await readFile(new URL(e.file, base), "utf8")),
        e.fdcId,
        e.name,
      ),
    ),
  );
  assert.equal(rows.length, 300);
  assert.equal(new Set(rows.map((r) => r.fdc_id)).size, 300);
  assert.equal(rows.filter((r) => r.calories_is_estimate === true).length, 12);
  assert.equal(
    rows.filter((r) => r.calories_kcal_per_100g === null).length,
    38,
  );
});
test("SQL JSON quoting handles apostrophes, backslashes and newlines", () => {
  const value = { name: "Farmer's food \\ sample\nnext line" };
  const encoded = sqlJson(value);
  assert.deepEqual(
    JSON.parse(encoded.slice(1, -8).replaceAll("''", "'")),
    value,
  );
});

test("negative calculated carbohydrate is unknown, with source preserved", () => {
  const data = fixture([{ ...n("205", -0.475), derivationCode: "NC" }]);
  const row = toFoodRow(data, 1, "Example");
  assert.equal(row.carbs_g_per_100g, null);
  assert.deepEqual(row.source_record, data);
  assert.throws(() => toFoodRow(fixture([n("205", -1)]), 1, "Example"));
});

test("SQL batching respects UTF-8 byte size and preserves every row in order", () => {
  const rows = ["é's", "b", "c", "d"];
  const render = (values: string[]) => sqlJson(values);
  const limit = Buffer.byteLength(render(rows.slice(0, 2)), "utf8");
  const batches = splitSqlBatches(rows, render, limit);
  assert.ok(batches.length > 1);
  assert.ok(batches.every((b) => Buffer.byteLength(b.sql, "utf8") <= limit));
  assert.deepEqual(
    batches.flatMap((b) =>
      JSON.parse(b.sql.slice(1, -8).replaceAll("''", "'")),
    ),
    rows,
  );
  assert.equal(
    batches.reduce((n, b) => n + b.rowCount, 0),
    rows.length,
  );
  assert.deepEqual(splitSqlBatches([], render, limit), []);
  assert.throws(() => splitSqlBatches(["too big"], render, 1));
});
