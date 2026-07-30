-- #124: persistent creative direction pool on drafts and frozen direction
-- identity on each output.
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "direction_id" uuid,
  ADD COLUMN "direction_snapshot" jsonb;
