CREATE TABLE IF NOT EXISTS "adscale_app"."human_quality_corpus_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "adscale_app"."campaigns"("id") ON DELETE CASCADE,
  "derivation_id" uuid NOT NULL REFERENCES "adscale_app"."derivations"("id") ON DELETE CASCADE,
  "generation_mode" text NOT NULL,
  "format" text NOT NULL DEFAULT '',
  "cohort" text NOT NULL DEFAULT 'baseline',
  "corpus_version" integer NOT NULL DEFAULT 1,
  "artifact_ref" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "quality_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "selected_by_user_id" text NOT NULL REFERENCES "adscale_app"."user"("id") ON DELETE CASCADE,
  "selected_at" timestamp DEFAULT now() NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "human_quality_corpus_items_cohort_check" CHECK (
    "cohort" in ('baseline', 'pre_learning', 'post_learning')
  ),
  CONSTRAINT "human_quality_corpus_items_status_check" CHECK (
    "status" in ('pending', 'evaluated', 'removed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "human_quality_corpus_items_derivation_version_uq"
  ON "adscale_app"."human_quality_corpus_items" ("workspace_id", "derivation_id", "corpus_version");

CREATE INDEX IF NOT EXISTS "human_quality_corpus_items_workspace_status_idx"
  ON "adscale_app"."human_quality_corpus_items" ("workspace_id", "status", "selected_at");

CREATE INDEX IF NOT EXISTS "human_quality_corpus_items_workspace_cohort_idx"
  ON "adscale_app"."human_quality_corpus_items" ("workspace_id", "cohort", "generation_mode", "format");

CREATE INDEX IF NOT EXISTS "human_quality_corpus_items_campaign_idx"
  ON "adscale_app"."human_quality_corpus_items" ("workspace_id", "campaign_id", "selected_at");

CREATE TABLE IF NOT EXISTS "adscale_app"."human_quality_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "corpus_item_id" uuid NOT NULL REFERENCES "adscale_app"."human_quality_corpus_items"("id") ON DELETE CASCADE,
  "reviewer_user_id" text NOT NULL REFERENCES "adscale_app"."user"("id") ON DELETE CASCADE,
  "visual_score" integer NOT NULL,
  "factual_pass" boolean NOT NULL,
  "intent" text NOT NULL,
  "primary_failure_reason" text NOT NULL,
  "other_reason_text" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "human_quality_evaluations_visual_score_check" CHECK (
    "visual_score" >= 0 AND "visual_score" <= 100
  ),
  CONSTRAINT "human_quality_evaluations_intent_check" CHECK (
    "intent" in ('approve', 'reject', 'regenerate')
  ),
  CONSTRAINT "human_quality_evaluations_failure_reason_check" CHECK (
    "primary_failure_reason" in (
      'visual_overload',
      'weak_hierarchy',
      'generic_template_feel',
      'illegible_cta',
      'unfocused_composition',
      'factual_issue',
      'format_or_crop_issue',
      'other'
    )
  )
);

CREATE INDEX IF NOT EXISTS "human_quality_evaluations_item_idx"
  ON "adscale_app"."human_quality_evaluations" ("workspace_id", "corpus_item_id", "created_at");

CREATE INDEX IF NOT EXISTS "human_quality_evaluations_reviewer_idx"
  ON "adscale_app"."human_quality_evaluations" ("workspace_id", "reviewer_user_id", "created_at");
