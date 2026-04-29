ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "generation_mode" text DEFAULT 'art_variation' NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "cta_variants" text[];--> statement-breakpoint
ALTER TABLE "adscale_app"."campaigns" ADD COLUMN "target_formats" text[];--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "generation_mode" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "variant_index" integer;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "cta_text" text;