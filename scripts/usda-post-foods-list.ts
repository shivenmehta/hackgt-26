// Run: npm run test:usda:post-foods-list
// Manual, read-only API request: POST /foods/list
import { getApiKey, checkStatus, run } from "./usda-utils";

async function main() {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ api_key: apiKey });
  // POST filters use JSON: arrays stay arrays and numbers stay numbers.
  const body = {
    dataType: ["Foundation", "SR Legacy"],
    pageSize: 10,
    sortBy: "fdcId",
    sortOrder: "asc",
  };
  // Do not print this URL: it contains your API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/list?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
  );
  checkStatus(response);
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error("Expected a food array.");
  console.log(`Returned ${result.length} food records.`);
  console.dir(result, { depth: null });
}

run(main);
