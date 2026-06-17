ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "output_learning_application" jsonb;
