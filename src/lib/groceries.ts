import type { WeeklyPlan } from "./planner";
export const grocerySections = [
  "Produce",
  "Proteins",
  "Dairy & eggs",
  "Grains & bakery",
  "Pantry",
  "Other",
] as const;
export interface GroceryItem {
  key: string;
  name: string;
  preparation?: string;
  section: (typeof grocerySections)[number];
  grams: number;
  costCents: number;
  meals: string[];
}
function section(name: string): GroceryItem["section"] {
  if (/\b(milk|cheese|yogurt|yoghurt|cream|butter|eggs?)\b/i.test(name))
    return "Dairy & eggs";
  if (
    /\b(chicken|beef|pork|lamb|fish|salmon|tuna|shrimp|prawns?|tofu|turkey)\b/i.test(
      name,
    )
  )
    return "Proteins";
  if (/\b(rice|pasta|bread|oats|flour|noodles|tortillas?|quinoa)\b/i.test(name))
    return "Grains & bakery";
  if (
    /\b(oil|salt|pepper|sauce|spice|cumin|paprika|sugar|honey|vinegar|canned|dried|beans|lentils|chickpeas)\b/i.test(
      name,
    )
  )
    return "Pantry";
  if (
    /\b(onions?|garlic|tomatoes|tomato|potatoes|potato|carrots?|spinach|broccoli|lemon|lime|lettuce|cabbage|avocado|mushrooms?|apple|banana|peas|ginger|cilantro|parsley)\b/i.test(
      name,
    )
  )
    return "Produce";
  return "Other";
}
const ingredientAliases: Record<string, string> = {
  onions: "onion",
  tomatoes: "tomato",
  potatoes: "potato",
  carrots: "carrot",
  eggs: "egg",
  lemons: "lemon",
  limes: "lime",
  mushrooms: "mushroom",
  cloves: "clove",
  "garlic cloves": "garlic",
  "garlic clove": "garlic",
  "spring onions": "spring onion",
  scallions: "spring onion",
  scallion: "spring onion",
  "green onions": "spring onion",
  "green onion": "spring onion",
  "bell peppers": "bell pepper",
  "chicken breasts": "chicken breast",
};
function groceryIdentity(name: string, context: string) {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, " ");
  const base = ingredientAliases[normalized] ?? normalized;
  // These forms can have materially different weight/yield. Raw/fresh and
  // chopping descriptions do not create separate shopping-list entries.
  const states = [
    "cooked",
    "dry",
    "dried",
    "canned",
    "drained",
    "frozen",
    "bone-in",
    "boneless",
    "skin-on",
    "skinless",
    "powder",
    "concentrate",
    "diluted",
  ].filter((state) => new RegExp(`\\b${state}\\b`, "i").test(context));
  return { key: `${base}:${states.join(",")}`, label: base, states };
}
export function groceryList(plan: WeeklyPlan): GroceryItem[] {
  const items = new Map<string, GroceryItem>();
  for (const day of plan.days)
    for (const meal of day.meals) {
      for (const ingredient of meal.recipe.ingredients) {
        const legacyNote = meal.recipe.assumptions
          ?.find((note) =>
            note.toLowerCase().startsWith(`${ingredient.name.toLowerCase()}:`),
          )
          ?.split(" Price:")[0];
        const preparation =
          ingredient.preparation ??
          (ingredient.groceryKey ? undefined : legacyNote);
        const identity = groceryIdentity(
          ingredient.name,
          `${ingredient.name} ${ingredient.groceryKey ?? ""} ${preparation ?? ""}`,
        );
        const key = identity.key;
        const item = items.get(key) ?? {
          key,
          name:
            identity.label.charAt(0).toUpperCase() +
            identity.label.slice(1) +
            (identity.states.length ? ` (${identity.states.join(", ")})` : ""),
          preparation,
          section: section(ingredient.name),
          grams: 0,
          costCents: 0,
          meals: [],
        };
        item.grams += ingredient.grams * plan.preferences.people;
        item.costCents += ingredient.costCents * plan.preferences.people;
        if (!item.meals.includes(meal.recipe.name))
          item.meals.push(meal.recipe.name);
        items.set(key, item);
      }
    }
  return [...items.values()].sort(
    (a, b) =>
      grocerySections.indexOf(a.section) - grocerySections.indexOf(b.section) ||
      a.name.localeCompare(b.name),
  );
}
export function groceryQuantity(grams: number) {
  return grams >= 1000
    ? `${Number((grams / 1000).toFixed(2))} kg`
    : `${Number(grams.toFixed(1))} g`;
}
export function groceryText(items: GroceryItem[], owned: Set<string>) {
  return [
    "Bridge weekly grocery list",
    "Estimated quantities needed; not package sizes. Checked items are already on hand.",
    ...grocerySections.flatMap((section) => {
      const rows = items.filter((item) => item.section === section);
      return rows.length
        ? [
            "",
            section,
            ...rows.map(
              (item) =>
                `${owned.has(item.key) ? "[x]" : "[ ]"} ${item.name} — ${groceryQuantity(item.grams)}${item.preparation ? ` (${item.preparation})` : ""}\n    For: ${item.meals.join(", ")}`,
            ),
          ]
        : [];
    }),
  ].join("\n");
}

/** Explicit names avoid hiding produce such as bell peppers or whole limes. */
const pantryStaples = new Set([
  "salt",
  "sea salt",
  "table salt",
  "kosher salt",
  "salt and pepper",
  "sugar",
  "white sugar",
  "granulated sugar",
  "caster sugar",
  "brown sugar",
  "pepper",
  "black pepper",
  "ground black pepper",
  "white pepper",
  "oil",
  "olive oil",
  "extra virgin olive oil",
  "vegetable oil",
  "canola oil",
  "sunflower oil",
  "cooking oil",
  "rapeseed oil",
  "vinegar",
  "white vinegar",
  "distilled white vinegar",
  "apple cider vinegar",
  "balsamic vinegar",
  "red wine vinegar",
  "white wine vinegar",
  "rice vinegar",
  "malt vinegar",
  "baking powder",
  "lime juice",
  "lemon juice",
  "water",
  "tap water",
  "boiling water",
]);
export function isPantryStaple(name: string): boolean {
  const normalized = name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return pantryStaples.has(normalized);
}

/** Shopping priority only: omitted flavorings remain in the actual recipes. */
export function isGroceryExtra(name: string): boolean {
  if (isPantryStaple(name)) return true;
  const normalized = name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
  return (
    /\b(sauces?|seasoning|spices?|garnish|marinade|dressing|vinegar|extract|stock|broth|bouillon)\b/.test(
      normalized,
    ) ||
    /\b(ketchup|mustard|mayonnaise|sriracha|tabasco|hoisin|worcestershire|pesto|chutney|curry paste|tomato paste|tomato puree|miso paste)\b/.test(
      normalized,
    ) ||
    /\b(cumin|paprika|turmeric|cinnamon|nutmeg|cloves|cardamom|coriander|oregano|thyme|rosemary|bay leaves|bay leaf|cayenne|chilli powder|chili powder|garam masala|five spice|parsley|cilantro|basil|mint|dill)\b/.test(
      normalized,
    ) ||
    /^(sesame oil|chili oil|chilli oil|honey|maple syrup|baking soda|bicarbonate of soda|cornstarch|corn flour|cornflour|sesame seeds)$/.test(
      normalized,
    )
  );
}
