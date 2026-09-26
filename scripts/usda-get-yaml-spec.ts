// Run: npm run test:usda:get-yaml-spec
// Manual, read-only API request: GET /yaml-spec
import { getApiKey, checkStatus, run } from "./usda-utils";

async function main() {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
  });
  // Do not print this URL: it contains your API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/yaml-spec?${params}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) },
  );
  checkStatus(response);
  console.log(await response.text());
}

run(main);
