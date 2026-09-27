import {
  initialize,
  storeStep,
  priceStep,
  progress,
  rankStep,
  assembleStep,
  imageStep,
  finishImages,
  failJob,
} from "./pipeline";
import { ingredientPriceKey, type Price, type PricedMeal } from "./types";
export async function planWorkflow(id: string) {
  "use workflow";
  try {
    const { all, eligible, preferences, warnings, weekStart } =
      await initialize(id);
    const store = await storeStep(id, preferences.location);
    if (store.reference)
      warnings.push(store.reason ?? "Reference-store prices are used.");
    const ingredients = [
      ...new Map(
        eligible
          .flatMap((r) => r.ingredients)
          .map((i) => [ingredientPriceKey(i), i]),
      ).values(),
    ];
    const prices = new Map<string, Price | null>();
    for (let offset = 0; offset < ingredients.length; offset += 4) {
      await progress(
        id,
        `Pricing ingredients ${Math.min(offset + 4, ingredients.length)} of ${ingredients.length}`,
      );
      const chunk = ingredients.slice(offset, offset + 4);
      const found = await Promise.all(
        chunk.map((i) => priceStep(i, store, id)),
      );
      chunk.forEach((i, index) =>
        prices.set(ingredientPriceKey(i), found[index]),
      );
    }
    const recipes: PricedMeal[] = eligible.flatMap((recipe) => {
      const found = recipe.ingredients.map((i) =>
        prices.get(ingredientPriceKey(i)),
      );
      if (found.some((p) => !p)) return [];
      const values = found as Price[];
      return [
        {
          ...recipe,
          prices: values,
          perServingCents:
            recipe.ingredients.reduce(
              (sum, i, index) => sum + i.grams * values[index].centsPerGram,
              0,
            ) / recipe.yield,
        },
      ];
    });
    if (recipes.length < eligible.length)
      warnings.push(
        `${eligible.length - recipes.length} recipes were excluded because ingredient prices were unavailable.`,
      );
    if (!recipes.length)
      throw new Error(
        "No fully priced recipes are available. Please retry when pricing services are available.",
      );
    const rankings = await rankStep(id, all, recipes, preferences);
    const selected = await assembleStep(
      id,
      recipes,
      rankings,
      preferences,
      store,
      warnings,
      weekStart,
    );
    try {
      for (let offset = 0; offset < selected.length; offset += 2)
        await Promise.all(selected.slice(offset, offset + 2).map(imageStep));
    } finally {
      await finishImages(id);
    }
  } catch (error) {
    await failJob(
      id,
      error instanceof Error
        ? error.message
        : "Planning failed. Please try again.",
    );
  }
}
