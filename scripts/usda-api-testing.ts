// Run from the repository root with: npm run test:usda
// This is a manual API experiment, not an automated test.
async function main() {
  const apiKey = process.env.USDA_API_KEY?.trim();

  if (!apiKey || apiKey === "your-usda-api-key") {
    throw new Error(
      "Set USDA_API_KEY in .env.local before running this script.",
    );
  }

  // const params = new URLSearchParams({
  //   api_key: apiKey,
  //   dataType: "Foundation,SR Legacy",
  //   pageSize: "25",
  //   pageNumber: "2",
  //   sortBy: "fdcId",
  //   sortOrder: "asc",
  // });
  const params = new URLSearchParams({
    api_key: apiKey,
    query: "cheddar cheese",
  });

  // Keep the full URL private: it contains the API key.
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) },
  );

  if (!response.ok) {
    throw new Error(`USDA request failed: HTTP ${response.status}`);
  }

  const foods: unknown = await response.json();
  // if (!Array.isArray(foods)) {
  //   throw new Error(
  //     "USDA returned an unexpected response; expected a food array.",
  //   );
  // }

  // console.log(`Received ${foods.length} food records:`);
  console.dir(foods, { depth: null });
}

main().catch((error: unknown) => {
  // Avoid printing a request URL or stack trace that might contain the key.
  const message = error instanceof Error ? error.message : "Unknown error";
  const apiKey = process.env.USDA_API_KEY?.trim();
  const safeMessage = apiKey
    ? message
        .replaceAll(apiKey, "[redacted]")
        .replaceAll(encodeURIComponent(apiKey), "[redacted]")
    : message;
  console.error(safeMessage);
  process.exitCode = 1;
});
