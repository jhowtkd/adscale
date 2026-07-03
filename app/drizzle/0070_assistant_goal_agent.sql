ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "creative_level" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_goal_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "adscale_app"."campaigns"("id") ON DELETE SET NULL,
  "objective" text NOT NULL DEFAULT '',
  "stage" text NOT NULL DEFAULT 'intake',
  "brief" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "plan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "blockers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "queued_instruction" text,
  "selected_base_version_id" uuid REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE SET NULL,
  "revision" integer NOT NULL DEFAULT 0,
  "started_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "completed_at" timestamp,
  "stopped_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_goal_runs_thread_uq" UNIQUE("thread_id"),
  CONSTRAINT "assistant_goal_runs_stage_check" CHECK ("stage" in (
    'intake','planning','awaiting_generation','generating_variants',
    'choosing_base','reviewing_base','awaiting_package','generating_package',
    'reviewing_package','completed','stopped','failed'
  ))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_goal_runs_scope_idx"
  ON "adscale_app"."assistant_goal_runs" ("workspace_id", "client_profile_id", "thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_goal_runs_stage_updated_idx"
  ON "adscale_app"."assistant_goal_runs" ("stage", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE CASCADE,
  "goal_run_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_goal_runs"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE CASCADE,
  "action_record_id" uuid REFERENCES "adscale_app"."assistant_action_records"("id") ON DELETE SET NULL,
  "addressed_by_version_id" uuid REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE SET NULL,
  "x" real NOT NULL,
  "y" real NOT NULL,
  "width" real NOT NULL,
  "height" real NOT NULL,
  "comment" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_artifact_annotations_rect_check" CHECK (
    "x" >= 0 AND "x" <= 1 AND "y" >= 0 AND "y" <= 1 AND
    "width" > 0 AND "width" <= 1 AND "height" > 0 AND "height" <= 1 AND
    "x" + "width" <= 1 AND "y" + "height" <= 1
  ),
  CONSTRAINT "assistant_artifact_annotations_status_check" CHECK ("status" in ('draft','submitted','addressed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_artifact_annotations_version_status_idx"
  ON "adscale_app"."assistant_artifact_annotations" ("version_id", "status", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."client_corpus_consents" (
  "client_profile_id" uuid PRIMARY KEY REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "reviewed_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "granted_at" timestamp,
  "revoked_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "client_corpus_consents_status_check" CHECK ("status" in ('granted','revoked'))
);
