// Run: npm run test:usda:get-json-spec
// Manual, read-only API request: GET /json-spec
import { getApiKey, checkStatus, run } from "./usda-utils";

async function main() {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
  });
  // Do not print this URL: it contains your API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/json-spec?${params}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) },
  );
  checkStatus(response);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("openapi" in result))
    throw new Error("Expected an OpenAPI document.");
  console.dir(result, { depth: null });
}

run(main);
