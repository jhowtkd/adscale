CREATE TABLE IF NOT EXISTS "adscale_app"."client_learning_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "slice_key" text NOT NULL,
  "primary_failure_reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'proposed',
  "evidence_refs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rationale" text NOT NULL,
  "proposed_at" timestamp DEFAULT now() NOT NULL,
  "accepted_at" timestamp,
  "accepted_by" text REFERENCES "adscale_app"."user"("id") ON DELETE SET NULL,
  "rejected_reason" text,
  "cooldown_until" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_learning_proposals_status_check"
    CHECK ("status" in ('proposed', 'accepted', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_learning_proposals_active_slice_uq"
  ON "adscale_app"."client_learning_proposals" ("workspace_id", "client_profile_id", "slice_key")
  WHERE "status" = 'proposed';
