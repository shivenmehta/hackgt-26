// Run: npm run test:usda:get-foods-list
// Manual, read-only API request: GET /foods/list
import { getApiKey, checkStatus, run } from "./usda-utils";

async function main() {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
    dataType: "Foundation,SR Legacy",
    pageSize: "10",
    sortBy: "fdcId",
    sortOrder: "asc",
  });
  // Do not print this URL: it contains your API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/list?${params}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) },
  );
  checkStatus(response);
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error("Expected a food array.");
  console.log(`Returned ${result.length} food records.`);
  console.dir(result, { depth: null });
}

run(main);
