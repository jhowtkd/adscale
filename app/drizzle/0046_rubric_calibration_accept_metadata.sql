ALTER TABLE "adscale_app"."rubric_calibration_adjustments"
  ADD COLUMN IF NOT EXISTS "accepted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "accepted_by" text REFERENCES "adscale_app"."user"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "change_spec" jsonb;
