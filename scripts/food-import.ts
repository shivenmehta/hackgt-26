// Pure conversion helpers shared by the exporter and its tests.
export type JsonObject = Record<string, unknown>;
export function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Expected ${label} to be an object`);
  return value as JsonObject;
}
function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Missing ${label}`);
  return value;
}
function amount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("Nutrient amount must be a finite nonnegative number");
  return value;
}
export function toFoodRow(
  input: unknown,
  expectedId: number,
  expectedName: string,
) {
  const record = object(input, "record");
  const food = object(record.food, "food");
  if (
    !Number.isSafeInteger(expectedId) ||
    expectedId <= 0 ||
    food.fdcId !== expectedId
  )
    throw new Error("FDC ID mismatch");
  if (food.dataType !== "Foundation")
    throw new Error("Expected Foundation data");
  const description = requiredString(food.description, "description");
  if (description.trim() !== expectedName)
    throw new Error("Description mismatch");
  if (record.source !== "USDA FoodData Central")
    throw new Error("Unexpected source");
  const fetchedAt = requiredString(record.fetchedAt, "fetchedAt");
  if (!Number.isFinite(Date.parse(fetchedAt)))
    throw new Error("Invalid fetchedAt");
  if (!Array.isArray(food.foodNutrients))
    throw new Error("Missing nutrients array");
  const nutrients = food.foodNutrients.map((n) => object(n, "nutrient"));
  function nutrient(
    number: string,
    unit: string,
  ): (JsonObject & { amount: number }) | null {
    const matches = nutrients.filter(
      (n) => String(n.number) === number && n.amount != null,
    );
    if (matches.length > 1) throw new Error(`Duplicate nutrient ${number}`);
    if (!matches.length) return null;
    const n = matches[0];
    if (typeof n.unitName !== "string" || n.unitName.toUpperCase() !== unit)
      throw new Error(
        `Unexpected unit for nutrient ${number}; expected ${unit}`,
      );
    // USDA reports negative calculated carbohydrate-by-difference values in nine
    // source records. Preserve raw JSON, but expose these as unknown to the app.
    if (
      number === "205" &&
      n.derivationCode === "NC" &&
      typeof n.amount === "number" &&
      Number.isFinite(n.amount) &&
      n.amount < 0
    )
      return null;
    return { ...n, amount: amount(n.amount)! };
  }
  let calories: number | null = null;
  let estimated: boolean | null = null;
  let provenance: JsonObject | null = null;
  for (const number of ["208", "957", "958"]) {
    const n = nutrient(number, "KCAL");
    if (n) {
      calories = n.amount;
      estimated = false;
      provenance = {
        method: "native-usda",
        basisGrams: 100,
        source: {
          fdcId: expectedId,
          dataType: "Foundation",
          description,
          nutrientNumber: number,
          unitName: "KCAL",
          fetchedAt,
          derivationCode: n.derivationCode ?? null,
          derivationDescription: n.derivationDescription ?? null,
        },
      };
      break;
    }
  }
  if (calories === null && record.nutritionFallbacks != null) {
    const fallbacks = object(record.nutritionFallbacks, "fallbacks");
    if (fallbacks.energy != null) {
      const e = object(fallbacks.energy, "energy fallback");
      if (
        e.unitName !== "KCAL" ||
        e.basisGrams !== 100 ||
        e.isEstimate !== true
      )
        throw new Error(
          "Invalid energy fallback basis, unit, or estimate flag",
        );
      const source = object(e.source, "fallback source");
      if (!Number.isSafeInteger(source.fdcId) || Number(source.fdcId) <= 0)
        throw new Error("Invalid fallback source ID");
      requiredString(source.dataType, "fallback data type");
      requiredString(source.description, "fallback description");
      requiredString(source.nutrientNumber, "fallback nutrient number");
      requiredString(e.matchNotes, "fallback match notes");
      calories = amount(e.amount);
      if (calories === null) throw new Error("Missing fallback amount");
      estimated = true;
      provenance = e;
    }
  }
  return {
    fdc_id: expectedId,
    name: requiredString(record.name, "name"),
    description,
    data_type: "Foundation",
    calories_kcal_per_100g: calories,
    protein_g_per_100g: nutrient("203", "G")?.amount ?? null,
    carbs_g_per_100g: nutrient("205", "G")?.amount ?? null,
    fat_g_per_100g: nutrient("204", "G")?.amount ?? null,
    fiber_g_per_100g: nutrient("291", "G")?.amount ?? null,
    sodium_mg_per_100g: nutrient("307", "MG")?.amount ?? null,
    calories_is_estimate: estimated,
    calorie_provenance: provenance,
    source_record: record,
    fetched_at: fetchedAt,
  };
}
export type FoodRow = ReturnType<typeof toFoodRow>;
export function sqlJson(value: unknown): string {
  // Seed SQL explicitly enables standard_conforming_strings. Escape SQL quotes;
  // JSON.stringify handles JSON quotes, backslashes, and embedded newlines.
  return "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
}

// Size the complete SQL text in UTF-8, including escaping and transaction overhead.
export function splitSqlBatches<T>(
  rows: T[],
  render: (rows: T[]) => string,
  maxBytes = 200_000,
) {
  const batches: { sql: string; rowCount: number }[] = [];
  let current: T[] = [];
  for (const row of rows) {
    const candidate = [...current, row];
    if (Buffer.byteLength(render(candidate), "utf8") > maxBytes) {
      if (!current.length)
        throw new Error("One food exceeds the SQL batch size limit");
      batches.push({ sql: render(current), rowCount: current.length });
      current = [row];
      if (Buffer.byteLength(render(current), "utf8") > maxBytes)
        throw new Error("One food exceeds the SQL batch size limit");
    } else current = candidate;
  }
  if (current.length)
    batches.push({ sql: render(current), rowCount: current.length });
  return batches;
}
