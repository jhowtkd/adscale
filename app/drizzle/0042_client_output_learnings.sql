CREATE TABLE IF NOT EXISTS "adscale_app"."client_output_learnings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "variable_key" text NOT NULL,
  "variable_value" text NOT NULL,
  "scope_generation_mode" text NOT NULL DEFAULT '',
  "scope_format" text NOT NULL DEFAULT '',
  "preference_direction" text NOT NULL DEFAULT 'prefer',
  "statement" text NOT NULL,
  "confidence" text NOT NULL DEFAULT 'low',
  "confidence_score" numeric(5, 4) NOT NULL DEFAULT '0',
  "sample_event_count" integer NOT NULL DEFAULT 0,
  "sample_campaign_count" integer NOT NULL DEFAULT 0,
  "supporting_evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "contradicting_evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "algorithm_version" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "mem0_memory_id" text,
  "last_evidence_at" timestamp,
  "approved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_output_learnings_confidence_check" CHECK ("confidence" in ('low', 'medium', 'high')),
  CONSTRAINT "client_output_learnings_direction_check" CHECK ("preference_direction" in ('prefer', 'avoid')),
  CONSTRAINT "client_output_learnings_status_check" CHECK ("status" in ('draft', 'approved', 'superseded', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_output_learnings_identity_uq"
  ON "adscale_app"."client_output_learnings" ("workspace_id", "client_profile_id", "variable_key", "variable_value", "scope_generation_mode", "scope_format");

CREATE INDEX IF NOT EXISTS "client_output_learnings_client_idx"
  ON "adscale_app"."client_output_learnings" ("workspace_id", "client_profile_id");

CREATE INDEX IF NOT EXISTS "client_output_learnings_status_idx"
  ON "adscale_app"."client_output_learnings" ("workspace_id", "client_profile_id", "status");
