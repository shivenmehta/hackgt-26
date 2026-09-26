// Run: npm run test:usda:get-food
// GET /food/{fdcId}; saves the abridged response locally.
// Optional arguments: <fdcId> <output-file> <display-name>
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getApiKey, checkStatus, run } from "./usda-utils";

async function main() {
  const apiKey = getApiKey();
  const fdcId = process.argv[2] ?? "1104812";
  const outputFile = process.argv[3] ?? "data/usda/brown-rice.json";
  const name = process.argv[4] ?? "Brown rice flour";
  if (!/^\d+$/.test(fdcId)) throw new Error("fdcId must contain only digits.");
  // The default is brown rice flour. Pass a reviewed FDC ID to select another food.
  const params = new URLSearchParams({
    api_key: apiKey,
    format: "abridged",
  });
  // Do not print this URL: it contains your API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?${params}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) },
  );
  checkStatus(response);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("fdcId" in result))
    throw new Error("Expected a food record with an fdcId.");
  console.dir(result, { depth: null });

  await mkdir(dirname(outputFile), { recursive: true });

  await writeFile(
    outputFile,
    JSON.stringify(
      {
        name,
        fetchedAt: new Date().toISOString(),
        source: "USDA FoodData Central",
        food: result,
      },
      null,
      2,
    ) + "\n",
  );
}

run(main);
