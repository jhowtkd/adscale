ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "creative_contract" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "regeneration_correction_brief" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "prompt_provenance" jsonb;
