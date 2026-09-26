# Import the food catalog into Supabase

These SQL files create and populate a real Supabase PostgreSQL table. Generating
files locally does not create or connect to a hosted database. No API key is needed
to generate the files or run them in your signed-in Supabase dashboard.

## First import

1. Create or open your project at the [Supabase dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor**, create a query, paste the contents of
   `migrations/202609260001_create_foods.sql`, and run it once. It creates
   `public.foods`. If that table already exists, inspect its schema before proceeding;
   this migration intentionally does not drop or overwrite an existing table.
3. Open [the batch index](foods-seed-batches/README.md). Run each numbered SQL file
   listed there as a **separate query**, in order. Each is at most 200,000 UTF-8
   bytes including its transaction. Do not paste multiple files together.
   The combined `foods-seed.sql` is too large for SQL Editor; keep it only for
   command-line imports with `psql`. All batches preserve the full source JSON.
4. Run `verify-foods.sql`. Expect 300 expected/imported foods, zero missing rows,
   12 calorie estimates, and 38 unknown calories. The salt row must show 0 kcal
   and `calories_is_estimate = true`. Verify RLS is enabled and the read policy exists.
5. Open **Table Editor → foods** to inspect the imported rows.

The seed can be rerun: it updates matching FDC IDs without adding duplicate rows
or deleting unrelated foods. It replaces all imported fields for those IDs, so
manual database edits to catalog rows are overwritten on the next import.
Each batch is transactional; completed batches remain imported if a later batch fails. If SQL Editor reports an error, fix the cause and
rerun that batch; if the editor session remains in a failed transaction,
run `ROLLBACK;` first. Run the schema migration only once.

## Regenerate and test

From the repository root:

```bash
npm run export:foods
npm run test:foods
```

The exporter reads exactly 300 entries from `data/usda/foundation-manifest.json`
and writes numbered batches with an index, the combined `foods-seed.sql`, and
`verify-foods.sql` here. It does not call USDA,
read credentials, or modify source food JSON. Duplicate IDs/paths, unexpected
units, invalid amounts, and mismatched records stop export before writing files.
The exception is USDA's negative calculated carbohydrate-by-difference values:
the nine affected rows import carbohydrate as NULL, preserve the source values,
and appear in `foods-import-report.json` for review. They are not changed to zero.
The 300-record expectation and regression counts are intentional safeguards for
this snapshot; update them deliberately when expanding the catalog.

## Column conventions

One row is one USDA food/preparation state, keyed by `fdc_id`. `name` comes from
the saved wrapper; `description` retains the exact USDA description. Source type
and retrieval time are in `data_type` and `fetched_at`. Complete saved wrappers
are retained in `source_record` JSONB, so nutrients without dedicated columns
remain available for later work.

All nutrient columns are per 100 grams of the edible portion in the described
preparation state. Protein (203), fat (204), carbohydrates (205), and fiber (291)
use grams; sodium (307) uses milligrams. Unexpected units fail validation.
Missing nutrients or amounts become SQL NULL, while explicit zero stays zero.

Native kcal selection prefers nutrient 208, then 957, then 958. These energy
methods are alternatives, not additive. The selected source and method are
recorded in `calorie_provenance`. If native energy is absent, the existing reviewed
`nutritionFallbacks.energy` supplies the value and provenance, including match
limitations. The estimate flag is true for these cross-record proxies, false for
native energy, and NULL for unknown energy. Native USDA energy can itself be
calculated; false does not imply a direct laboratory measurement. No new
estimates are generated. Leeks' fallback covers a different edible portion;
read its match notes before using it for precise planning.

## Access and connecting the application later

RLS and grants permit anonymous and signed-in app users to read the catalog.
Neither role can insert, update, or delete foods. Imports run through the SQL
Editor as an administrator. The public source JSON contains food data, not secrets.
Select only the columns needed for the UI to avoid fetching the large source JSON.

To connect Next.js later, set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` using your project's settings.
The existing `.env.example` shows the variable names. This task does not wire the
application to Supabase or add users, recipes, or prices. Never put a secret or
service-role key in a `NEXT_PUBLIC_` variable.

References: [Supabase tables](https://supabase.com/docs/guides/database/tables),
[data import](https://supabase.com/docs/guides/database/import-data), and
[database security](https://supabase.com/docs/guides/database/secure-data).
