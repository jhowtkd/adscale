CREATE TABLE IF NOT EXISTS "adscale_app"."client_profile_olhar_config" (
  "client_profile_id" uuid PRIMARY KEY NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "voice_id" text NOT NULL,
  "display_name" text NOT NULL,
  "config" jsonb NOT NULL,
  "review_status" text NOT NULL,
  "source" text NOT NULL DEFAULT 'seeded',
  "approved_at" timestamp,
  "approved_by" text REFERENCES "adscale_app"."user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_profile_olhar_config_review_status_check"
    CHECK ("review_status" in ('pending_review', 'approved', 'changes_requested'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_profile_olhar_config_workspace_profile_uq"
  ON "adscale_app"."client_profile_olhar_config" ("workspace_id", "client_profile_id");
