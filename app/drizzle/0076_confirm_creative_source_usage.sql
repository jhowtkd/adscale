ALTER TABLE "adscale_app"."creative_work_sources"
ADD COLUMN "usage_confirmed" boolean DEFAULT false NOT NULL;

UPDATE "adscale_app"."creative_work_sources"
SET "usage_confirmed" = true
WHERE "usage" IN ('content', 'style');
