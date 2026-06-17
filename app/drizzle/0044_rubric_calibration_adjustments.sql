CREATE TABLE IF NOT EXISTS "adscale_app"."rubric_calibration_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "adjustment_version" text NOT NULL,
  "status" text NOT NULL DEFAULT 'proposed',
  "target_module" text NOT NULL,
  "target_key" text NOT NULL,
  "slice_key" text NOT NULL,
  "rationale" text NOT NULL,
  "evidence_refs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "proposed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rubric_calibration_adjustments_status_check" CHECK (
    "status" in ('proposed', 'accepted', 'superseded')
  ),
  CONSTRAINT "rubric_calibration_adjustments_target_module_check" CHECK (
    "target_module" in ('score_ceiling', 'observable_rubric', 'gate_classifier')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "rubric_calibration_adjustments_slice_version_uq"
  ON "adscale_app"."rubric_calibration_adjustments" ("slice_key", "adjustment_version", "target_module", "target_key");

CREATE INDEX IF NOT EXISTS "rubric_calibration_adjustments_version_status_idx"
  ON "adscale_app"."rubric_calibration_adjustments" ("adjustment_version", "status", "proposed_at");
