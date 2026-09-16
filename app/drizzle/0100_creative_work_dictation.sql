ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN IF NOT EXISTS "has_dictated_excerpt" boolean NOT NULL DEFAULT false;
