CREATE TABLE IF NOT EXISTS "adscale_app"."human_quality_corpus_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid REFERENCES "adscale_app"."client_profiles"("id") ON DELETE SET NULL,
  "campaign_id" uuid NOT NULL REFERENCES "adscale_app"."campaigns"("id") ON DELETE CASCADE,
  "derivation_id" uuid NOT NULL REFERENCES "adscale_app"."derivations"("id") ON DELETE CASCADE,
  "generation_mode" text NOT NULL,
  "format" text NOT NULL DEFAULT '',
  "corpus_version" integer NOT NULL DEFAULT 1,
  "source_label" text NOT NULL,
  "artifact_ref" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "quality_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "promoted_corpus_item_id" uuid REFERENCES "adscale_app"."human_quality_corpus_items"("id") ON DELETE SET NULL,
  "promoted_at" timestamp,
  "captured_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "human_quality_corpus_candidates_source_label_check" CHECK (
    "source_label" in ('synthetic_fixture', 'operator_imported', 'real_customer')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "human_quality_corpus_candidates_derivation_version_uq"
  ON "adscale_app"."human_quality_corpus_candidates" ("workspace_id", "derivation_id", "corpus_version");

CREATE INDEX IF NOT EXISTS "human_quality_corpus_candidates_workspace_source_idx"
  ON "adscale_app"."human_quality_corpus_candidates" ("workspace_id", "source_label", "captured_at");

CREATE INDEX IF NOT EXISTS "human_quality_corpus_candidates_promoted_idx"
  ON "adscale_app"."human_quality_corpus_candidates" ("promoted_corpus_item_id");
