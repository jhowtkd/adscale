ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "candidates" jsonb;
--> statement-breakpoint