-- Run once in the Supabase SQL Editor before foods-seed.sql.
BEGIN;
CREATE TABLE public.foods (
  fdc_id bigint PRIMARY KEY CHECK (fdc_id > 0),
  name text NOT NULL,
  description text NOT NULL,
  data_type text NOT NULL,
  calories_kcal_per_100g numeric CHECK (calories_kcal_per_100g >= 0),
  protein_g_per_100g numeric CHECK (protein_g_per_100g >= 0),
  carbs_g_per_100g numeric CHECK (carbs_g_per_100g >= 0),
  fat_g_per_100g numeric CHECK (fat_g_per_100g >= 0),
  fiber_g_per_100g numeric CHECK (fiber_g_per_100g >= 0),
  sodium_mg_per_100g numeric CHECK (sodium_mg_per_100g >= 0),
  calories_is_estimate boolean,
  calorie_provenance jsonb,
  source_record jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  CONSTRAINT calorie_metadata_consistent CHECK (
    (calories_kcal_per_100g IS NULL AND calories_is_estimate IS NULL AND calorie_provenance IS NULL)
    OR (calories_kcal_per_100g IS NOT NULL AND calories_is_estimate IS NOT NULL AND calorie_provenance IS NOT NULL)
  )
);
COMMENT ON TABLE public.foods IS 'USDA catalog. Nutrients per 100 g edible portion in the described preparation state. NULL means unknown.';
COMMENT ON COLUMN public.foods.source_record IS 'Complete original JSON wrapper, including preserved Foundation response and any reviewed fallbacks.';
COMMENT ON COLUMN public.foods.calories_is_estimate IS 'True for cross-record fallback, false for native USDA energy, NULL for missing energy. Native USDA energy can itself be calculated.';
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.foods FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.foods TO anon, authenticated;
CREATE POLICY foods_public_read ON public.foods FOR SELECT TO anon, authenticated USING (true);
COMMIT;
