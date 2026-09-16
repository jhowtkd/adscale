ALTER TABLE "adscale_app"."beta_analytics_events" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "beta_analytics_events_idempotency_uq" ON "adscale_app"."beta_analytics_events" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."creative_work_selection_effects" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "work_item_id" uuid NOT NULL,
  "output_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "effect_version" integer NOT NULL DEFAULT 1,
  "idempotency_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "state" text NOT NULL DEFAULT 'pending',
  "requested_at" timestamp NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp,
  "lease_owner" text,
  "lease_expires_at" timestamp,
  "error_code" text,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects"
  ADD CONSTRAINT "creative_work_selection_effects_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects"
  ADD CONSTRAINT "creative_work_selection_effects_work_item_id_fk"
  FOREIGN KEY ("work_item_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects"
  ADD CONSTRAINT "creative_work_selection_effects_output_id_fk"
  FOREIGN KEY ("output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects"
  ADD CONSTRAINT "creative_work_selection_effects_kind_check"
  CHECK ("kind" in ('library','value_event','recipe'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects"
  ADD CONSTRAINT "creative_work_selection_effects_state_check"
  CHECK ("state" in ('pending','processing','retry_wait','done','dead','canceled'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_selection_effects_dedup_uq" ON "adscale_app"."creative_work_selection_effects" USING btree ("workspace_id","output_id","kind","effect_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_selection_effects_scope_idx" ON "adscale_app"."creative_work_selection_effects" USING btree ("workspace_id","work_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_selection_effects_claim_idx" ON "adscale_app"."creative_work_selection_effects" USING btree ("state","next_attempt_at");
