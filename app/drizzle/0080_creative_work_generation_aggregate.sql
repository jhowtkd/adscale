-- #103: durable first-terminal and aggregate-completion markers. The anchor
-- lives on the first output of each correlation so revisions can form a new
-- generation without sharing the work-item's aggregate state.
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "generation_first_terminal_at" timestamp without time zone,
  ADD COLUMN "generation_completed_at" timestamp without time zone;
