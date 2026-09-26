// Shared setup only; each example keeps its own fetch request visible.
export function getApiKey(): string {
  const key = process.env.USDA_API_KEY?.trim();
  if (!key || key === "your-usda-api-key") {
    throw new Error(
      "Set USDA_API_KEY in .env.local before running this script.",
    );
  }
  return key;
}

export function run(main: () => Promise<void>) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    const key = process.env.USDA_API_KEY?.trim();
    console.error(
      key
        ? message
            .replaceAll(key, "[redacted]")
            .replaceAll(encodeURIComponent(key), "[redacted]")
        : message,
    );
    process.exitCode = 1;
  });
}

export function checkStatus(response: Response) {
  if (!response.ok) {
    throw new Error(`USDA request failed: HTTP ${response.status}`);
  }
}
