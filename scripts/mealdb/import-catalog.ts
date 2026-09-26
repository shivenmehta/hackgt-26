// Offline by default. --fetch downloads missing raw records; --refresh replaces them.
import { format } from "prettier";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  normalizeMeal,
  type RawMeal,
  type Selection,
} from "../../src/lib/meals/model";

const root = resolve("data/mealdb");
async function writeJson(path: string, value: unknown) {
  await writeFile(
    `${path}.tmp`,
    await format(JSON.stringify(value), { parser: "json" }),
  );
  await rename(`${path}.tmp`, path);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--fetch", "--refresh"].includes(arg)))
    throw new Error(
      "Use --fetch, --refresh, or no arguments for an offline rebuild.",
    );
  const selection = JSON.parse(
    await readFile(join(root, "selection.json"), "utf8"),
  ) as Selection[];
  if (new Set(selection.map((item) => item.id)).size !== selection.length)
    throw new Error("Duplicate selection IDs");
  await mkdir(join(root, "raw"), { recursive: true });
  const meals = [];
  for (const item of selection) {
    if (!/^\d+$/.test(item.id)) throw new Error("Invalid selection ID");
    const path = join(root, "raw", `${item.id}.json`);
    let cached: string | null = null;
    try {
      cached = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (args.includes("--refresh") || (!cached && args.includes("--fetch"))) {
      const key = process.env.MEALDB_API_KEY?.trim() || "1";
      const url = `https://www.themealdb.com/api/json/v1/${encodeURIComponent(key)}/lookup.php?i=${item.id}`;
      let downloaded = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(20_000),
        });
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < 2
        ) {
          await delay(2000 * (attempt + 1));
          continue;
        }
        if (!response.ok)
          throw new Error(`MealDB HTTP ${response.status} for meal ${item.id}`);
        const payload = (await response.json()) as { meals: RawMeal[] | null };
        if (!Array.isArray(payload.meals) || payload.meals.length !== 1)
          throw new Error(`Missing recipe ${item.id}`);
        const wrapper = {
          fetchedAt: new Date().toISOString(),
          response: payload,
        };
        normalizeMeal(payload.meals[0], item, wrapper.fetchedAt);
        await writeJson(path, wrapper);
        cached = JSON.stringify(wrapper);
        downloaded = true;
        break;
      }
      if (!downloaded) throw new Error(`Could not download ${item.id}`);
      await delay(300);
    }
    if (!cached)
      throw new Error(`Missing raw recipe ${item.id}; run with --fetch.`);
    const wrapper = JSON.parse(cached) as {
      fetchedAt: string;
      response: { meals: RawMeal[] };
    };
    if (wrapper.response.meals?.length !== 1)
      throw new Error(`Invalid raw response for ${item.id}`);
    meals.push(
      normalizeMeal(wrapper.response.meals[0], item, wrapper.fetchedAt),
    );
  }
  const counts: Record<string, number> = {};
  for (const meal of meals)
    counts[meal.cuisine] = (counts[meal.cuisine] ?? 0) + 1;
  const catalog = {
    schemaVersion: 1,
    attribution:
      "Recipe data and imagery: TheMealDB (https://www.themealdb.com/)",
    meals,
  };
  await writeJson(join(root, "meals.json"), catalog);
  await writeJson(join(root, "manifest.json"), {
    schemaVersion: 1,
    total: meals.length,
    cuisines: counts,
    selectionMethod:
      "Editorial starter catalog, not a popularity ranking. Source cuisine labels preserved separately.",
    vegetarian: meals.filter((m) => m.dietary.vegetarian === true).length,
    vegan: meals.filter((m) => m.dietary.vegan === true).length,
    sourceDietConflicts: meals
      .filter((m) => m.sourceDietLabels.some((d) => m.dietary[d] === false))
      .map((m) => m.id),
    entries: meals.map((m) => ({
      id: m.id,
      name: m.name,
      cuisine: m.cuisine,
      rawFile: m.source.rawFile,
      fetchedAt: m.source.fetchedAt,
    })),
  });
  console.log(`Built ${meals.length} recipes locally:`, counts);
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Import failed";
  const key = process.env.MEALDB_API_KEY;
  console.error(
    key
      ? message
          .replaceAll(key, "[redacted]")
          .replaceAll(encodeURIComponent(key), "[redacted]")
      : message,
  );
  process.exitCode = 1;
});
