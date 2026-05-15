ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "creative_diagnosis_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "creative_diagnosis" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "creative_diagnosis_source" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "creative_diagnosis_updated_at" timestamp;
