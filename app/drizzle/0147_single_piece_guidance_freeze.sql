ALTER TABLE "adscale_app"."creative_work_items" ADD COLUMN "prepared_guidance" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "frozen_guidance" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "layer_guidance_selections" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_preparation_attempts" ADD COLUMN "frozen_guidance" jsonb;