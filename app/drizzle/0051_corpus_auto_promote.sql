ALTER TABLE "adscale_app"."human_quality_corpus_items"
  ADD COLUMN IF NOT EXISTS "auto_promoted" boolean NOT NULL DEFAULT false;

ALTER TABLE "adscale_app"."human_quality_corpus_items"
  ALTER COLUMN "selected_by_user_id" DROP NOT NULL;
