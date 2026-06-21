CREATE TABLE IF NOT EXISTS "adscale_app"."human_quality_feedback_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "corpus_item_id" uuid NOT NULL REFERENCES "adscale_app"."human_quality_corpus_items"("id") ON DELETE CASCADE,
  "evaluation_id" uuid NOT NULL REFERENCES "adscale_app"."human_quality_evaluations"("id") ON DELETE CASCADE,
  "derivation_id" uuid NOT NULL REFERENCES "adscale_app"."derivations"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "adscale_app"."campaigns"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "source_label" text NOT NULL,
  "cohort" text NOT NULL,
  "generation_mode" text NOT NULL,
  "format" text NOT NULL DEFAULT '',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "human_quality_feedback_artifacts_source_label_check" CHECK (
    "source_label" in ('synthetic_fixture', 'operator_imported', 'real_customer')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "human_quality_feedback_artifacts_corpus_item_uq"
  ON "adscale_app"."human_quality_feedback_artifacts" ("corpus_item_id");

CREATE UNIQUE INDEX IF NOT EXISTS "human_quality_feedback_artifacts_evaluation_uq"
  ON "adscale_app"."human_quality_feedback_artifacts" ("evaluation_id");

CREATE INDEX IF NOT EXISTS "human_quality_feedback_artifacts_workspace_source_idx"
  ON "adscale_app"."human_quality_feedback_artifacts" ("workspace_id", "source_label", "created_at");
