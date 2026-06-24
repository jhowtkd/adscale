ALTER TABLE "adscale_app"."rubric_calibration_adjustments"
  ADD COLUMN IF NOT EXISTS "rejected_reason" text,
  ADD COLUMN IF NOT EXISTS "rejected_at" timestamp,
  ADD COLUMN IF NOT EXISTS "rejected_by" text REFERENCES "adscale_app"."user"("id") ON DELETE SET NULL;

ALTER TABLE "adscale_app"."rubric_calibration_adjustments"
  DROP CONSTRAINT IF EXISTS "rubric_calibration_adjustments_status_check";

ALTER TABLE "adscale_app"."rubric_calibration_adjustments"
  ADD CONSTRAINT "rubric_calibration_adjustments_status_check"
    CHECK ("status" in ('proposed', 'accepted', 'superseded', 'rejected'));
