-- #227: one nullable JSONB state on the canonical selected Peça.
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN IF NOT EXISTS "layerization" jsonb;
