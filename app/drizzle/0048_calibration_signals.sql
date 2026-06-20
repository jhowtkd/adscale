CREATE TABLE IF NOT EXISTS "adscale_app"."calibration_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid REFERENCES "adscale_app"."client_profiles"("id") ON DELETE SET NULL,
  "campaign_id" uuid NOT NULL REFERENCES "adscale_app"."campaigns"("id") ON DELETE CASCADE,
  "derivation_id" uuid NOT NULL REFERENCES "adscale_app"."derivations"("id") ON DELETE CASCADE,
  "output_decision_event_id" uuid REFERENCES "adscale_app"."output_decision_events"("id") ON DELETE SET NULL,
  "human_verdict" text NOT NULL,
  "system_olhar_verdict" text,
  "system_export_status" text,
  "mismatch_bucket" text,
  "source_label" text NOT NULL,
  "reviewer_id" text NOT NULL REFERENCES "adscale_app"."user"("id") ON DELETE CASCADE,
  "reviewed_at" timestamp NOT NULL,
  "sanitized_note" text,
  "idempotency_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "calibration_signals_human_verdict_check" CHECK (
    "human_verdict" in ('entra', 'quase', 'nao_entra')
  ),
  CONSTRAINT "calibration_signals_source_label_check" CHECK (
    "source_label" in ('synthetic_fixture', 'operator_imported', 'real_customer')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "calibration_signals_idempotency_uq"
  ON "adscale_app"."calibration_signals" ("workspace_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "calibration_signals_client_profile_idx"
  ON "adscale_app"."calibration_signals" ("workspace_id", "client_profile_id", "reviewed_at");

CREATE INDEX IF NOT EXISTS "calibration_signals_derivation_idx"
  ON "adscale_app"."calibration_signals" ("workspace_id", "derivation_id");

CREATE TABLE IF NOT EXISTS "adscale_app"."calibration_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "status" text NOT NULL DEFAULT 'candidate',
  "rationale" text NOT NULL,
  "supporting_signal_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "confidence" text NOT NULL DEFAULT 'low',
  "caveats" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mismatch_bucket" text,
  "version" integer NOT NULL DEFAULT 1,
  "approved_at" timestamp,
  "approved_by" text REFERENCES "adscale_app"."user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "calibration_rules_status_check" CHECK (
    "status" in ('candidate', 'approved', 'rejected', 'deprecated')
  ),
  CONSTRAINT "calibration_rules_confidence_check" CHECK (
    "confidence" in ('low', 'medium', 'high')
  )
);

CREATE INDEX IF NOT EXISTS "calibration_rules_client_status_idx"
  ON "adscale_app"."calibration_rules" ("workspace_id", "client_profile_id", "status");
