import { writeFile } from "node:fs/promises";
import { format } from "prettier";
import { getGrokEnrichedMeals } from "../../src/lib/meals/enriched-catalog";
import type { Nutrients } from "../../src/lib/meals/nutrition";

async function main() {
  const source = await getGrokEnrichedMeals();
  const meals = source
    .map((meal) => {
      const n = meal.nutrition;
      const grok = n.grokCalories;
      return {
        id: meal.id,
        name: meal.name,
        isFullyUsdaCalculated: n.status === "calculated-estimate",
        hasGrokEstimate: (grok?.coverage.grokEstimated ?? 0) > 0,
        usdaStatus: n.status,
        usdaKnownSubtotal: n.knownSubtotal,
        usdaTotals:
          n.coverage.assumed100g > 0
            ? { caloriesKcal: null, proteinG: null, fatG: null }
            : n.totals,
        grok: grok
          ? {
              status: grok.status,
              caloriesKcal: grok.totalCaloriesKcal,
              subtotalCaloriesKcal: grok.estimatedSubtotalKcal,
              missingCalorieIngredients: grok.coverage.missing,
            }
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const output = {
    basis: "whole-recipe",
    units: { caloriesKcal: "kcal", proteinG: "g", fatG: "g" },
    definitions: {
      isFullyUsdaCalculated:
        "All three USDA-based nutrient totals are present and no 100 g quantity placeholders were used. USDA proxies may still be involved; this does not mean perfect or verified nutrition.",
      hasGrokEstimate:
        "At least one ingredient calorie contribution was successfully estimated with Grok. Does not imply complete coverage; check grok.status.",
      usdaKnownSubtotal:
        "Available contributions with stated masses or USDA portion conversions; excludes 100 g placeholders.",
      usdaTotals:
        "Totals are hidden when any 100 g quantity placeholder was used. Otherwise each nutrient is null unless every ingredient contributes a value.",
      grok: "Calorie-only overlay combining preserved USDA contributions and Grok estimates. Protein/fat were not estimated by Grok and retain the original USDA quantities. null means not processed. Subtotal may be incomplete.",
    },
    meals,
  };
  await writeFile(
    "data/combined/meals-summary.json",
    await format(JSON.stringify(output), { parser: "json" }),
  );
  const display = (value: number | null) =>
    value === null ? "—" : String(value);
  const triple = (n: Nutrients) =>
    [n.caloriesKcal, n.proteinG, n.fatG].map(display).join(" / ");
  const escape = (s: string) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
  const markdown = [
    "# Meal nutrition summary",
    "",
    "All numbers are for the **whole recipe**, not per serving. Nutrient triples are **kcal / protein g / fat g**. A dash means unknown, not zero.",
    "",
    "**Fully USDA** means complete USDA-based totals without 100 g quantity placeholders. Food/portion proxies may still be used; this is not a guarantee of accuracy. **Grok estimated** means at least one successful ingredient estimate, not necessarily a complete recipe total.",
    "",
    "Known subtotals exclude placeholder quantities; USDA totals are hidden if any such quantities remain. Grok covers calories only; do not treat its calories and USDA macros as a consistently recalculated nutrient profile.",
    "",
    "| Meal (ID) | Fully USDA | Grok estimated | USDA status | Known subtotal (kcal/P/F) | USDA totals (kcal/P/F) | Grok kcal total | Grok kcal subtotal | Grok status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...meals.map(
      (m) =>
        `| ${escape(m.name)} (${m.id}) | ${m.isFullyUsdaCalculated ? "Yes" : "No"} | ${m.hasGrokEstimate ? "Yes" : "No"} | ${m.usdaStatus} | ${triple(m.usdaKnownSubtotal)} | ${triple(m.usdaTotals)} | ${display(m.grok?.caloriesKcal ?? null)} | ${display(m.grok?.subtotalCaloriesKcal ?? null)} | ${m.grok?.status ?? "Not processed"} |`,
    ),
    "",
  ].join("\n");
  await writeFile(
    "data/combined/meals-summary.md",
    await format(markdown, { parser: "markdown" }),
  );
  console.log(
    `Summarized ${meals.length} meals: ${meals.filter((m) => m.isFullyUsdaCalculated).length} fully USDA calculated, ${meals.filter((m) => m.hasGrokEstimate).length} with Grok estimates.`,
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Summary export failed",
  );
  process.exitCode = 1;
});
