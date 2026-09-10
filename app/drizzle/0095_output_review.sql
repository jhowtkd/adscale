ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN "review_draft" jsonb,
  ADD COLUMN "revision_context" jsonb;
