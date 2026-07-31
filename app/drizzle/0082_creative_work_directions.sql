-- #124: persistent creative direction pool on drafts and frozen direction
-- identity on each output.
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "direction_id" uuid,
  ADD COLUMN "direction_snapshot" jsonb;

-- Replace the legacy plan unique index with two conditional indexes so that
-- direction-based outputs are unique by direction while legacy outputs keep
-- the historical constraint.
DROP INDEX IF EXISTS "adscale_app"."creative_work_outputs_plan_uq";

CREATE UNIQUE INDEX "creative_work_outputs_direction_plan_uq"
  ON "adscale_app"."creative_work_outputs"
  ("work_item_id", "creative_level", "target_format", "version_number", "direction_id")
  WHERE "direction_id" is not null;

CREATE UNIQUE INDEX "creative_work_outputs_legacy_plan_uq"
  ON "adscale_app"."creative_work_outputs"
  ("work_item_id", "creative_level", "target_format", "version_number")
  WHERE "direction_id" is null;
