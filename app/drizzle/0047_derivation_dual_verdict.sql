ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "olhar_verdict" jsonb;

ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "export_status" jsonb;
