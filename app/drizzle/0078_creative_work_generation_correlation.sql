-- #96: one durable correlation UUID per generation, shared by its units.
ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN "generation_correlation_id" uuid;

UPDATE "adscale_app"."creative_work_items"
SET "generation_correlation_id" = gen_random_uuid()
WHERE "generation_correlation_id" IS NULL;

ALTER TABLE "adscale_app"."creative_work_items"
  ALTER COLUMN "generation_correlation_id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "generation_correlation_id" SET NOT NULL;

CREATE UNIQUE INDEX "creative_work_items_generation_correlation_uq"
  ON "adscale_app"."creative_work_items" ("workspace_id", "generation_correlation_id");

ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "generation_correlation_id" uuid;

UPDATE "adscale_app"."creative_work_outputs" AS output
SET "generation_correlation_id" = work."generation_correlation_id"
FROM "adscale_app"."creative_work_items" AS work
WHERE output."work_item_id" = work."id"
  AND output."generation_correlation_id" IS NULL;

ALTER TABLE "adscale_app"."creative_work_outputs"
  ALTER COLUMN "generation_correlation_id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "generation_correlation_id" SET NOT NULL;

CREATE INDEX "creative_work_outputs_correlation_idx"
  ON "adscale_app"."creative_work_outputs" ("workspace_id", "generation_correlation_id", "status");
