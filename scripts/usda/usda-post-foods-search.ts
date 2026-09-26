// Run: npm run test:usda:post-foods-search
// Manual, read-only API request: POST /foods/search
import { getApiKey, checkStatus, run } from "./usda-utils";

async function main() {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ api_key: apiKey });
  // POST filters use JSON: arrays stay arrays and numbers stay numbers.
  const body = {
    query: "cheddar cheese",
    pageSize: 10,
  };
  // Do not print this URL: it contains your API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
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
}

run(main);
