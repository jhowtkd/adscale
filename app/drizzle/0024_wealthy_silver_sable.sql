ALTER TABLE "adscale_app"."derivations" ADD COLUMN "quality_verdict" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "hard_failures" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "polish_suggestions" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "quality_gated_at" timestamp;--> statement-breakpoint
UPDATE "adscale_app"."derivations"
SET "quality_verdict" = 'acceptable'
WHERE "status" = 'completed'
  AND "quality_verdict" IS NULL;