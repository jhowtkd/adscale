ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN IF NOT EXISTS "selection_effects" jsonb;
