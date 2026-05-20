ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "qa_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "qa_checklist" jsonb;
ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "qa_issues" jsonb;
ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "qa_suggestions" jsonb;
ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "qa_analyzed_at" timestamp;
