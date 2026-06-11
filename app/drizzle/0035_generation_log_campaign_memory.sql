ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "generation_log" jsonb;
ALTER TABLE "adscale_app"."campaigns" ADD COLUMN IF NOT EXISTS "campaign_memory" jsonb;
