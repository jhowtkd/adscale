ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "decisions" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "confidence" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "probabilities" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "returned_model" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "current_at_completion" boolean;--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "error_code" text;