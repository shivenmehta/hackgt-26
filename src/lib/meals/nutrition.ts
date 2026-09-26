export type Nutrients = {
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
};
export type Portion = {
  id?: number;
  amount?: number;
  gramWeight?: number;
  modifier?: string;
  portionDescription?: string;
  measureUnit?: { name?: string; abbreviation?: string };
};
export type NutritionFood = {
  fdcId: number;
  description: string;
  dataType: string;
  nutrients: Nutrients;
  caloriesIsEstimate: boolean;
  calorieProvenance: unknown;
  sourceFile: string;
  portions: Portion[];
  portionSourceFdcId: number;
  nutrientProvenance?: Partial<Record<keyof Nutrients, unknown>>;
};
export type IngredientMatch = {
  food: NutritionFood;
  kind: "direct" | "proxy" | "search-candidate";
  notes: string;
};
export type Quantity = {
  grams: number;
  method: "explicit-mass" | "usda-portion" | "assumed-100g";
  sourceFdcId: number | null;
  portionId: number | null;
  notes: string;
};
export const nutrientKeys = ["caloriesKcal", "proteinG", "fatG"] as const;
const empty = (): Nutrients => ({
  caloriesKcal: null,
  proteinG: null,
  fatG: null,
});
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function readNutrients(record: Record<string, unknown>): {
  nutrients: Nutrients;
  caloriesIsEstimate: boolean;
  calorieProvenance: unknown;
} {
  const food = (record.food ?? record) as Record<string, unknown>;
  const entries = (food.foodNutrients ?? []) as {
    number?: string;
    amount?: number;
    unitName?: string;
    nutrient?: { number?: string; unitName?: string };
  }[];
  function value(number: string, unit: string) {
    const found = entries.filter(
      (n) =>
        String(n.number ?? n.nutrient?.number) === number && n.amount != null,
    );
    if (found.length > 1)
      throw new Error(`Duplicate nutrient ${number} in ${food.fdcId}`);
    const n = found[0];
    if (!n) return null;
    if ((n.unitName ?? n.nutrient?.unitName)?.toLowerCase() !== unit)
      throw new Error(`Unexpected nutrient unit for ${number}`);
    return typeof n.amount === "number" &&
      Number.isFinite(n.amount) &&
      n.amount >= 0
      ? n.amount
      : null;
  }
  let caloriesKcal: number | null = null;
  let calorieProvenance: unknown = null;
  let caloriesIsEstimate = false;
  for (const number of ["208", "957", "958"]) {
    caloriesKcal = value(number, "kcal");
    if (caloriesKcal !== null) {
      calorieProvenance = {
        fdcId: food.fdcId,
        nutrientNumber: number,
        basisGrams: 100,
        method: "native-usda",
      };
      break;
    }
  }
  const energy = (
    record.nutritionFallbacks as
      | {
          energy?: {
            amount?: number;
            unitName?: string;
            basisGrams?: number;
            isEstimate?: boolean;
          };
        }
      | undefined
  )?.energy;
  if (
    caloriesKcal === null &&
    energy &&
    energy.unitName?.toUpperCase() === "KCAL" &&
    energy.basisGrams === 100 &&
    energy.isEstimate === true &&
    typeof energy.amount === "number" &&
    Number.isFinite(energy.amount) &&
    energy.amount >= 0
  ) {
    caloriesKcal = energy.amount;
    caloriesIsEstimate = true;
    calorieProvenance = energy;
  }
  return {
    nutrients: {
      caloriesKcal,
      proteinG: value("203", "g"),
      fatG: value("204", "g"),
    },
    caloriesIsEstimate,
    calorieProvenance,
  };
}
const fractions: Record<string, string> = {
  "½": "1/2",
  "¼": "1/4",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};
const numberPattern = "(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?)";
function numeric(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .reduce((sum, part) => {
      const [a, b] = part.split("/").map(Number);
      return sum + (b === undefined ? a : a / b);
    }, 0);
}
function textMeasure(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2")
    .replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (s) => fractions[s])
    .replace(/\s+/g, " ")
    .trim();
}
const volume: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  litre: 1000,
  liter: 1000,
  litres: 1000,
  liters: 1000,
  tsp: 4.92892159375,
  teaspoon: 4.92892159375,
  teaspoons: 4.92892159375,
  tbsp: 14.78676478125,
  tbs: 14.78676478125,
  tblsp: 14.78676478125,
  tbls: 14.78676478125,
  tablespoon: 14.78676478125,
  tablespoons: 14.78676478125,
  cup: 236.5882365,
  cups: 236.5882365,
};
const mass: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
};
function fallback(reason: string): Quantity {
  return {
    grams: 100,
    method: "assumed-100g",
    sourceFdcId: null,
    portionId: null,
    notes: `${reason} User-requested placeholder: assumes 100 g for this entire ingredient line, not 100 g per cup, jar, or piece.`,
  };
}
export function convertQuantity(
  measurement: string | null,
  food: NutritionFood,
  name: string,
): Quantity {
  if (!measurement) return fallback("Measurement missing.");
  const text = textMeasure(measurement);
  if (
    /\b(plus|extra|heaped|heaping|rounded|divided|for frying|for greasing)\b/.test(
      text,
    )
  )
    return fallback(
      "Quantity contains an unquantified addition or preparation-dependent amount.",
    );
  const pack = text.match(
    new RegExp(
      `^(${numberPattern})\\s*[x×]\\s*(${numberPattern})\\s*(kg|g|grams?|oz|ounces?|lbs?|pounds?)\\b`,
    ),
  );
  const explicit = text.match(
    new RegExp(
      `^(${numberPattern})\\s*(kg|g|grams?|oz|ounces?|lbs?|pounds?)\\b`,
    ),
  );
  let grams: number | null = pack
    ? numeric(pack[1]) * numeric(pack[2]) * mass[pack[3]]
    : explicit
      ? numeric(explicit[1]) * mass[explicit[2]]
      : null;
  // Parenthesized mass equivalents, e.g. 4 tablespoons (55 grams).
  const equivalent = text.match(
    new RegExp(`\\((${numberPattern})\\s*(g|grams?|kg|oz|ounces?)\\)`),
  );
  if (grams === null && equivalent)
    grams = numeric(equivalent[1]) * mass[equivalent[2]];
  if (grams !== null && Number.isFinite(grams) && grams >= 0)
    return {
      grams,
      method: "explicit-mass",
      sourceFdcId: null,
      portionId: null,
      notes:
        "Recipe-stated mass converted to grams. Assumes edible ingredient weight; no cooking-loss adjustment.",
    };
  const parsed = text.match(
    new RegExp(`^(${numberPattern})(?:\\s*([a-z]+))?(.*)$`),
  );
  if (!parsed || /\d\s*[-–]\s*\d|\bor\b|\bto\b/.test(text))
    return fallback("Unresolved or ranged measurement.");
  const amount = numeric(parsed[1]);
  if (!Number.isFinite(amount) || amount < 0)
    return fallback("Invalid quantity.");
  const unit = parsed[2] ?? "";
  const requestedVolume = volume[unit];
  if (/\b(kosher|sea) salt\b/i.test(name) && requestedVolume)
    return fallback("Table-salt volume is not valid for these salt crystals.");
  if (
    /\b(ground|flaked|melted)\b/.test(name.toLowerCase() + " " + text) &&
    requestedVolume
  )
    return fallback(
      "Preparation changes volume density; no matching prepared-density rule.",
    );
  const candidates: {
    portion: Portion;
    factor: number;
    rank: number;
    notes: string;
  }[] = [];
  for (const p of food.portions) {
    if (!(p.gramWeight && p.gramWeight > 0 && p.amount && p.amount > 0))
      continue;
    const u = p.measureUnit?.name?.toLowerCase() ?? "";
    if (/racc|serving/.test(u)) continue;
    const modifier = (p.modifier ?? p.portionDescription ?? "").toLowerCase();
    const desc = (u === "undetermined" ? modifier : `${u} ${modifier}`).trim();
    const sourceUnit = u === "undetermined" ? desc.split(/[ ,]/)[0] : u;
    const sourceVolume = volume[sourceUnit];
    if (requestedVolume && sourceVolume) {
      if (
        /\bwhole\b/.test(modifier) &&
        /pepper|spice/i.test(food.description) &&
        !/whole|seed/i.test(name)
      )
        continue;
      if (
        /\b(cooked|mashed|pureed|sifted|packed|ground|flaked|melted)\b/.test(
          modifier,
        ) &&
        !modifier
          .split(/\W+/)
          .some(
            (w) =>
              /^(cooked|mashed|pureed|sifted|packed|ground|flaked|melted)$/.test(
                w,
              ) && text.includes(w),
          )
      )
        continue;
      candidates.push({
        portion: p,
        factor: requestedVolume / sourceVolume,
        rank:
          requestedVolume === sourceVolume
            ? 0
            : Math.abs(Math.log(requestedVolume / sourceVolume)) + 1,
        notes:
          "USDA ingredient-specific household weight; volume scaling assumes US customary cups/spoons. Household weights are estimates.",
      });
    } else if (!requestedVolume) {
      const size = text.match(/\b(small|medium|large|extra large)\b/)?.[0];
      if (
        size &&
        !desc.includes(size) &&
        !(
          size === "large" &&
          /egg/.test(desc) &&
          /large/i.test(food.description)
        )
      )
        continue;
      const requestedCount = unit
        .match(/^(cloves?|slices?|eggs?|onions?|pieces?|stalks?)$/)?.[0]
        ?.replace(/s$/, "");
      const sourceCount = desc.match(
        /\b(clove|slice|egg|onion|piece|stalk)\b/,
      )?.[1];
      const implicitEgg =
        /\beggs?\b/i.test(name) &&
        /egg/.test(desc) &&
        (!unit || /^(beaten|large|medium|small|free)$/.test(unit));
      const implicitOnion =
        /^(onion|onions|red onions|white onions)$/i.test(name) &&
        /onion/.test(desc) &&
        (!unit ||
          /^(chopped|sliced|finely|diced|quartered|medium|large|small|cut)$/.test(
            unit,
          ));
      if (
        (requestedCount && requestedCount === sourceCount) ||
        implicitEgg ||
        implicitOnion
      )
        candidates.push({
          portion: p,
          factor: 1,
          rank: 0,
          notes:
            "USDA edible household-piece weight; individual sizes vary. Unspecified size uses the USDA reference portion.",
        });
    }
  }
  candidates.sort(
    (a, b) => a.rank - b.rank || (a.portion.id ?? 0) - (b.portion.id ?? 0),
  );
  const best = candidates[0];
  if (!best) return fallback("No compatible USDA household portion weight.");
  return {
    grams:
      (amount * best.factor * best.portion.gramWeight!) / best.portion.amount!,
    method: "usda-portion",
    sourceFdcId: food.portionSourceFdcId,
    portionId: best.portion.id ?? null,
    notes:
      best.notes +
      (food.portionSourceFdcId !== food.fdcId
        ? " Portion comes from a separately documented USDA proxy food."
        : ""),
  };
}
function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function calculateNutrition(
  ingredients: { position: number; name: string; measurement: string | null }[],
  matches: Map<string, IngredientMatch>,
) {
  const rows = ingredients.map((ingredient) => {
    const match = matches.get(normalizeName(ingredient.name));
    if (!match)
      return {
        ...ingredient,
        match: null,
        quantity: null,
        nutrients: empty(),
        issues: ["No accepted USDA food match; not counted as zero."],
      };
    const preparation =
      `${ingredient.name} ${ingredient.measurement ?? ""}`.toLowerCase();
    const incompatible =
      (/\bcooked\b/.test(preparation) &&
        /\b(raw|dry|uncooked)\b/i.test(match.food.description)) ||
      (/\b(dried|dehydrated)\b/.test(preparation) &&
        /\braw\b/i.test(match.food.description)) ||
      (/\b(bone.in|skin.on|shell.on)\b/.test(preparation) &&
        /boneless|skinless|shrimp/i.test(match.food.description)) ||
      (/^eggs?$/.test(normalizeName(ingredient.name)) &&
        /\b(yolk|yolks|yolkes|white|whites)\b/.test(preparation));
    const quantity = incompatible
      ? null
      : convertQuantity(ingredient.measurement, match.food, ingredient.name);
    const nutrients = empty();
    if (quantity)
      for (const key of nutrientKeys) {
        const n = match.food.nutrients[key];
        nutrients[key] = n === null ? null : (n * quantity.grams) / 100;
      }
    return {
      ...ingredient,
      match: {
        fdcId: match.food.fdcId,
        description: match.food.description,
        dataType: match.food.dataType,
        kind: match.kind,
        notes: match.notes,
        sourceFile: match.food.sourceFile,
        caloriesIsEstimate: match.food.caloriesIsEstimate,
        calorieProvenance: match.food.calorieProvenance,
        nutrientProvenance: match.food.nutrientProvenance ?? null,
      },
      quantity,
      nutrients,
      issues: incompatible
        ? [
            "Preparation conflicts with selected USDA food; requires a different match.",
          ]
        : nutrientKeys
            .filter((k) => nutrients[k] === null)
            .map((k) => `USDA ${k} is missing; not counted as zero.`),
    };
  });
  const totals = empty(),
    knownSubtotal = empty(),
    estimatedSubtotal = empty();
  const nutrientCoverage = {} as Record<
    keyof Nutrients,
    { included: number; missing: number }
  >;
  for (const key of nutrientKeys) {
    const available = rows.filter((r) => r.nutrients[key] !== null);
    const known = available.filter(
      (r) => r.quantity?.method !== "assumed-100g",
    );
    estimatedSubtotal[key] = available.length
      ? round(available.reduce((sum, r) => sum + r.nutrients[key]!, 0))
      : null;
    knownSubtotal[key] = known.length
      ? round(known.reduce((sum, r) => sum + r.nutrients[key]!, 0))
      : null;
    totals[key] =
      available.length === rows.length && rows.length > 0
        ? estimatedSubtotal[key]
        : null;
    nutrientCoverage[key] = {
      included: available.length,
      missing: rows.length - available.length,
    };
  }
  const assumed = rows.filter(
    (r) => r.quantity?.method === "assumed-100g",
  ).length;
  const complete = nutrientKeys.every((k) => totals[k] !== null);
  return {
    basis: "whole-recipe" as const,
    status: !complete
      ? "partial"
      : assumed
        ? "assumed-quantities"
        : "calculated-estimate",
    totals,
    knownSubtotal,
    estimatedSubtotal,
    perServing: null,
    coverage: {
      ingredients: rows.length,
      matched: rows.filter((r) => r.match).length,
      quantitiesConverted: rows.filter(
        (r) => r.quantity && r.quantity.method !== "assumed-100g",
      ).length,
      assumed100g: assumed,
      nutrients: nutrientCoverage,
    },
    warnings: [
      "Ingredient-input estimates, not laboratory measurements of the cooked dish. Cooking losses, frying absorption, discarded liquids, and unlisted ingredients are not modeled.",
      "Per-serving values require a reviewed serving count.",
      "Food matches may use approximate USDA proxies; inspect ingredient match notes and nutrient provenance.",
      ...(assumed
        ? [
            "Contains user-requested 100 g placeholder quantities. Review before using for nutrition targets.",
          ]
        : []),
    ],
    ingredients: rows.map((r) => ({
      ...r,
      nutrients: Object.fromEntries(
        nutrientKeys.map((k) => [
          k,
          r.nutrients[k] === null ? null : round(r.nutrients[k]!),
        ]),
      ) as Nutrients,
    })),
  };
}
