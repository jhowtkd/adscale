ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN "qa_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN "qa_checklist" jsonb,
  ADD COLUMN "qa_issues" jsonb,
  ADD COLUMN "qa_suggestions" jsonb,
  ADD COLUMN "qa_analyzed_at" timestamp;
