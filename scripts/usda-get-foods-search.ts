// Run: npm run test:usda:get-foods-search
// Manual, read-only API request: GET /foods/search
import { getApiKey, checkStatus, run } from "./usda-utils";

async function main() {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
    query: process.argv[2] ?? "roti",
    pageSize: "10",
    dataType: "Foundation",
  });
  // Do not print this URL: it contains your API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) },
  );
  checkStatus(response);
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("foods" in result) ||
    !Array.isArray(result.foods)
  )
    throw new Error("Expected a search result containing a foods array.");
  console.log(`Returned ${result.foods.length} matches on this page.`);
  console.dir(result, { depth: null });

  console.table(
    result.foods.map((food: { fdcId: number; description: string }) => ({
      id: food.fdcId,
      description: food.description,
    })),
  );
}

run(main);
