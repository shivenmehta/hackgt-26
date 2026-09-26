import {
  readFile,
  writeFile,
  rename,
  mkdir,
  open,
  unlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { format } from "prettier";
import type { CatalogMeal } from "../../src/lib/meals/model";
import {
  DEFAULT_GROK_MODEL,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  targetsFor,
  requestInput,
  inputHash,
  validCache,
  validateEstimates,
  summarize,
  type EstimateRecord,
} from "../../src/lib/meals/grok-best-effort";

const root = "data/grok-best-effort";
async function save(path: string, value: unknown) {
  await writeFile(
    path + ".tmp",
    await format(JSON.stringify(value), { parser: "json" }),
  );
  await rename(path + ".tmp", path);
}
async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--dry-run", "--offline", "--limit"]);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i]))
      throw new Error("Use --dry-run, --offline, or --limit <recipe count>");
    if (args[i] === "--limit") {
      if (!/^\d+$/.test(args[++i] ?? "") || Number(args[i]) < 1)
        throw new Error("--limit must be a positive integer");
    }
  }
  const limit = args.includes("--limit")
    ? Number(args[args.indexOf("--limit") + 1])
    : Infinity;
  const offline = args.includes("--offline"),
    dry = args.includes("--dry-run");
  const model = process.env.GROK_MODEL?.trim() || DEFAULT_GROK_MODEL;
  const raw = await readFile("data/mealdb/meals.json", "utf8");
  const parsed = JSON.parse(raw) as { meals: CatalogMeal[] };
  const base = parsed;
  const eligible = base.meals.filter((m) => targetsFor(m).length > 0);
  const cacheDir = `${root}/cache`;
  await mkdir(cacheDir, { recursive: true });
  const records = new Map<string, EstimateRecord>();
  for (const meal of eligible) {
    try {
      const record = JSON.parse(
        await readFile(`${cacheDir}/${inputHash(meal, model)}.json`, "utf8"),
      ) as EstimateRecord;
      if (validCache(record, meal, model)) records.set(meal.id, record);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(error instanceof SyntaxError)
      )
        throw error;
    }
  }
  const pending = eligible.filter((m) => !records.has(m.id));
  console.log(
    JSON.stringify(
      {
        eligibleRecipes: eligible.length,
        targetIngredientLines: eligible.reduce(
          (s, m) => s + targetsFor(m).length,
          0,
        ),
        cachedRecipes: records.size,
        pendingRecipes: pending.length,
        requestsThisRun: offline || dry ? 0 : Math.min(pending.length, limit),
        model,
      },
      null,
      2,
    ),
  );
  if (dry) return;
  const key = (process.env.XAI_API_KEY || process.env.GROK_API_KEY)?.trim();
  if (!offline && pending.length && !key)
    throw new Error(
      "Set XAI_API_KEY or GROK_API_KEY in .env.local; never use NEXT_PUBLIC_.",
    );
  const lockPath = `${root}/.grok-enrichment.lock`;
  const lock = await open(lockPath, "wx");
  let failed = false;
  try {
    const queue = offline ? [] : pending.slice(0, limit);
    let completed = 0;
    async function worker() {
      while (queue.length && !failed) {
        const meal = queue.shift()!;
        try {
          let response: Response | undefined;
          for (let attempt = 0; attempt < 3; attempt++) {
            response = await fetch("https://api.x.ai/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: JSON.stringify(requestInput(meal)) },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "ingredient_macro_estimates",
                    strict: true,
                    schema: RESPONSE_SCHEMA,
                  },
                },
                max_tokens: 10000,
              }),
              signal: AbortSignal.timeout(60000),
            });
            if (
              response.ok ||
              ![429, 500, 502, 503, 504].includes(response.status)
            )
              break;
            if (attempt < 2)
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * 2 ** attempt),
              );
          }
          if (!response?.ok)
            throw new Error(`API HTTP ${response?.status ?? "unknown"}`);
          const body = (await response.json()) as {
            model?: string;
            choices?: {
              finish_reason?: string;
              message?: { content?: string; refusal?: string };
            }[];
          };
          const choice = body.choices?.[0];
          if (
            choice?.finish_reason !== "stop" ||
            choice.message?.refusal ||
            !choice.message?.content
          )
            throw new Error("Incomplete or refused model response");
          const estimates = validateEstimates(
            JSON.parse(choice.message.content),
            targetsFor(meal),
          );
          const record: EstimateRecord = {
            inputHash: inputHash(meal, model),
            requestedModel: model,
            model: body.model || model,
            createdAt: new Date().toISOString(),
            promptVersion: PROMPT_VERSION,
            estimates,
          };
          await save(`${cacheDir}/${record.inputHash}.json`, {
            ...record,
            input: requestInput(meal),
          });
          records.set(meal.id, record);
          completed++;
          if (completed % 10 === 0 || queue.length === 0)
            console.log(
              `Saved ${completed} new recipe estimates; ${records.size}/${eligible.length} cached.`,
            );
        } catch (error) {
          failed = true;
          const reason =
            error instanceof Error && /^API HTTP \d+$/.test(error.message)
              ? error.message
              : "Request or response validation failed";
          console.error(
            `Meal ${meal.id}: ${reason}. Saved progress is retained; rerun to resume.`,
          );
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    const meals = base.meals
      .map((meal) => summarize(meal, records.get(meal.id)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const report = {
      schemaVersion: 1,
      promptVersion: PROMPT_VERSION,
      model,
      sourceFile: "data/mealdb/meals.json",
      sourceSha256: createHash("sha256").update(raw).digest("hex"),
      recipes: meals.length,
      cached: records.size,
      complete: meals.filter((m) => m.status === "estimated").length,

      pending: meals.filter((m) => m.status === "pending").length,
    };
    await save(`${root}/meals.json`, {
      ...report,
      notice:
        "Unverified Grok-only best-effort whole-recipe estimates based on MealDB ingredients and instructions. No USDA data is used; ambiguous quantities use explicit recipe-specific assumptions. All five nutrients are numeric for successful estimates; null only for pending recipes. Not per serving. Cache contains assumptions and ingredient contributions.",
      meals,
    });
    await save(`${root}/report.json`, report);
    console.log(JSON.stringify(report, null, 2));
    if (failed) process.exitCode = 1;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
main().catch(() => {
  console.error(
    "Grok enrichment could not start or save output. Check flags, .env.local, catalog files, and whether another enrichment process holds data/grok-best-effort/.grok-enrichment.lock. No secrets or API response bodies are logged.",
  );
  process.exitCode = 1;
});
