ALTER TABLE "adscale_app"."campaign_assets" ADD COLUMN "role" text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "quality_score" integer;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "score_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "score_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "score_issues" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "regeneration_suggestion" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "scored_at" timestamp;