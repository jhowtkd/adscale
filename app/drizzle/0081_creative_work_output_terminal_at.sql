-- #103: preserve each output's terminal transition time separately from the
-- mutable lease/heartbeat timestamp in updated_at.
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "terminal_at" timestamp without time zone;

UPDATE "adscale_app"."creative_work_outputs"
SET "terminal_at" = "updated_at"
WHERE "status" IN ('completed', 'failed')
  AND "terminal_at" IS NULL;
