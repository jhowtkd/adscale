CREATE TABLE IF NOT EXISTS "adscale_app"."output_decision_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "adscale_app"."user"("id") ON DELETE CASCADE,
  "client_profile_id" uuid REFERENCES "adscale_app"."client_profiles"("id") ON DELETE SET NULL,
  "campaign_id" uuid NOT NULL REFERENCES "adscale_app"."campaigns"("id") ON DELETE CASCADE,
  "derivation_id" uuid NOT NULL REFERENCES "adscale_app"."derivations"("id") ON DELETE CASCADE,
  "parent_derivation_id" uuid REFERENCES "adscale_app"."derivations"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "direction" text NOT NULL,
  "strength" text NOT NULL,
  "source" text NOT NULL,
  "context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "idempotency_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "output_decision_events_action_check" CHECK (
    "action" in ('approved', 'rejected', 'regenerated', 'saved_reference', 'selected_for_delivery')
  ),
  CONSTRAINT "output_decision_events_direction_check" CHECK (
    "direction" in ('positive', 'negative', 'corrective')
  ),
  CONSTRAINT "output_decision_events_strength_check" CHECK (
    "strength" in ('strong', 'medium', 'weak')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "output_decision_events_idempotency_uq"
  ON "adscale_app"."output_decision_events" ("workspace_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "output_decision_events_workspace_created_idx"
  ON "adscale_app"."output_decision_events" ("workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "output_decision_events_campaign_idx"
  ON "adscale_app"."output_decision_events" ("workspace_id", "campaign_id", "created_at");

CREATE INDEX IF NOT EXISTS "output_decision_events_derivation_idx"
  ON "adscale_app"."output_decision_events" ("workspace_id", "derivation_id", "created_at");

CREATE INDEX IF NOT EXISTS "output_decision_events_client_profile_idx"
  ON "adscale_app"."output_decision_events" ("workspace_id", "client_profile_id", "created_at");
