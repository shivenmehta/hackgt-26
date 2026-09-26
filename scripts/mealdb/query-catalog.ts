import { getMeals } from "../../src/lib/meals/catalog";
import {
  CUISINES,
  type Cuisine,
  type Diet,
  type MealType,
} from "../../src/lib/meals/model";

async function main() {
  const [cuisine, diet, mealType] = process.argv.slice(2);
  if (cuisine && ![...CUISINES, "any"].includes(cuisine))
    throw new Error(`Cuisine must be one of ${CUISINES.join(", ")}, or any.`);
  if (diet && !["vegetarian", "vegan", "any"].includes(diet))
    throw new Error("Diet must be vegetarian, vegan, or any.");
  if (
    mealType &&
    ![
      "breakfast",
      "lunch",
      "dinner",
      "snack",
      "dessert",
      "side",
      "any",
    ].includes(mealType)
  )
    throw new Error("Invalid meal type.");
  const meals = await getMeals({
    cuisine: cuisine === "any" ? undefined : (cuisine as Cuisine | undefined),
    diet: diet === "any" ? undefined : (diet as Diet | undefined),
    mealType:
      mealType === "any" ? undefined : (mealType as MealType | undefined),
  });
  console.table(
    meals.map((m) => ({
      id: m.id,
      name: m.name,
      cuisine: m.cuisine,
      category: m.sourceCategory,
      mealTypes: m.mealTypes.join(", "),
      vegetarian: m.dietary.vegetarian,
      vegan: m.dietary.vegan,
    })),
  );
  console.log(
    `${meals.length} meals. Diet filters use ingredient screening, not source categories. Unknown suitability is excluded.`,
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Query failed");
  process.exitCode = 1;
});
