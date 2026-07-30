-- #98: preserve the original queue-entry timestamp across re-deliveries.
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "queued_at" timestamp without time zone;

UPDATE "adscale_app"."creative_work_outputs"
SET "queued_at" = "created_at"
WHERE "queued_at" IS NULL;

ALTER TABLE "adscale_app"."creative_work_outputs"
  ALTER COLUMN "queued_at" SET DEFAULT now(),
  ALTER COLUMN "queued_at" SET NOT NULL;
