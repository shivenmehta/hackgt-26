import { createHash } from "node:crypto";

export type Diet = "vegetarian" | "vegan";
export type MealType =
  "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | "side";
export const CUISINES = [
  "Mexican",
  "Indian",
  "Chinese",
  "American",
  "Italian",
  "Japanese",
  "Thai",
  "French",
  "Greek",
  "Turkish",
  "Moroccan",
  "Spanish",
  "British",
  "Vietnamese",
  "Jamaican",
  "Canadian",
  "Egyptian",
  "Tunisian",
  "Polish",
  "Portuguese",
  "Filipino",
] as const;
export type Cuisine = (typeof CUISINES)[number];
export type RawMeal = Record<string, unknown>;
export type Selection = {
  id: string;
  name: string;
  cuisine: Cuisine;
  sourceFingerprint: string;
  reviewIssues?: string[];
  mealTypes: MealType[];
  dietReview?: {
    vegetarian: boolean | null;
    vegan: boolean | null;
    notes: string;
  };
};
export type CatalogMeal = {
  id: string;
  name: string;
  cuisine: Cuisine;
  sourceArea: string | null;
  sourceCountry: string | null;
  sourceCategory: string | null;
  sourceDietLabels: Diet[];
  dietary: {
    vegetarian: boolean | null;
    vegan: boolean | null;
    basis: "ingredient-screening" | "unreviewed";
    notes: string;
  };
  mealTypes: MealType[];
  mealTypeBasis: "editorial";
  instructions: string;
  ingredients: { position: number; name: string; measurement: string | null }[];
  servings: number | null;
  nutrition: null;
  pricing: null;
  imageUrl: string | null;
  youtubeUrl: string | null;
  originalSourceUrl: string | null;
  tags: string[];
  source: {
    provider: "TheMealDB";
    mealUrl: string;
    fetchedAt: string;
    rawFile: string;
  };
  reviewIssues: string[];
};

export function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function requiredText(raw: RawMeal, key: string): string {
  const value = optionalText(raw[key]);
  if (!value) throw new Error(`Missing recipe field: ${key}`);
  return value;
}
export function recipeFingerprint(raw: RawMeal): string {
  return createHash("sha256").update(JSON.stringify(raw)).digest("hex");
}
export function normalizeMeal(
  raw: RawMeal,
  selection: Selection,
  fetchedAt: string,
): CatalogMeal {
  const id = requiredText(raw, "idMeal");
  if (id !== selection.id || !/^\d+$/.test(id))
    throw new Error("Recipe ID mismatch");
  if (Number.isNaN(Date.parse(fetchedAt)))
    throw new Error("Invalid retrieval date");
  if (recipeFingerprint(raw) !== selection.sourceFingerprint)
    throw new Error(
      `Recipe ${id} changed; review source and dietary annotations before updating its fingerprint.`,
    );
  const ingredients: CatalogMeal["ingredients"] = [];
  const reviewIssues: string[] = [
    ...(selection.reviewIssues ?? []),
    "Serving count, gram conversions, nutrition, and prices need enrichment.",
  ];
  for (let position = 1; position <= 20; position++) {
    const name = optionalText(raw[`strIngredient${position}`]);
    const measurement = optionalText(raw[`strMeasure${position}`]);
    if (name) {
      ingredients.push({ position, name, measurement });
      if (!measurement)
        reviewIssues.push(`Missing measurement at ingredient ${position}.`);
    } else if (measurement) {
      reviewIssues.push(
        `Measurement without ingredient at slot ${position}; see raw response.`,
      );
    }
  }
  if (!ingredients.length) throw new Error(`Recipe ${id} has no ingredients`);
  const sourceCategory = optionalText(raw.strCategory);
  const sourceDietLabels: Diet[] =
    sourceCategory === "Vegan"
      ? ["vegetarian", "vegan"]
      : sourceCategory === "Vegetarian"
        ? ["vegetarian"]
        : [];
  const review = selection.dietReview;
  if (review && sourceDietLabels.some((diet) => review[diet] === false)) {
    reviewIssues.push(
      "Source dietary category conflicts with ingredient screening; use dietary fields for filtering.",
    );
  }
  return {
    id,
    name: requiredText(raw, "strMeal"),
    cuisine: selection.cuisine,
    sourceArea: optionalText(raw.strArea),
    sourceCountry: optionalText(raw.strCountry),
    sourceCategory,
    sourceDietLabels,
    dietary: {
      vegetarian: review?.vegetarian ?? null,
      vegan: review?.vegan ?? null,
      basis: review ? "ingredient-screening" : "unreviewed",
      notes:
        review?.notes ??
        "Unknown suitability; do not treat an unreviewed recipe as diet-compatible.",
    },
    mealTypes: selection.mealTypes,
    mealTypeBasis: "editorial",
    instructions: requiredText(raw, "strInstructions"),
    ingredients,
    servings: null,
    nutrition: null,
    pricing: null,
    imageUrl: optionalText(raw.strMealThumb),
    youtubeUrl: optionalText(raw.strYoutube),
    originalSourceUrl: optionalText(raw.strSource),
    tags: (optionalText(raw.strTags) ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    source: {
      provider: "TheMealDB",
      mealUrl: `https://www.themealdb.com/meal/${id}`,
      fetchedAt,
      rawFile: `raw/${id}.json`,
    },
    reviewIssues,
  };
}
export type MealFilters = {
  cuisine?: Cuisine;
  diet?: Diet;
  mealType?: MealType;
  query?: string;
};
export function filterMeals(
  meals: CatalogMeal[],
  filters: MealFilters = {},
): CatalogMeal[] {
  const query = filters.query?.trim().toLowerCase();
  return meals.filter(
    (meal) =>
      (!filters.cuisine || meal.cuisine === filters.cuisine) &&
      (!filters.diet || meal.dietary[filters.diet] === true) &&
      (!filters.mealType || meal.mealTypes.includes(filters.mealType)) &&
      (!query ||
        meal.name.toLowerCase().includes(query) ||
        meal.ingredients.some((item) =>
          item.name.toLowerCase().includes(query),
        )),
  );
}
