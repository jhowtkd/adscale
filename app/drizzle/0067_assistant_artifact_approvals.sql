CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_approval_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "operation_id" uuid NOT NULL,
  "artifact_type" text NOT NULL,
  "lineage_id" uuid NOT NULL,
  "promoted_version_id" uuid NOT NULL,
  "previous_official_version_id" uuid,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_comparison_acknowledgements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "creative_target_version_id" uuid NOT NULL,
  "plan_lineage_id" uuid NOT NULL,
  "linked_plan_version_id" uuid NOT NULL,
  "compared_official_plan_version_id" uuid NOT NULL,
  "compared_plan_head_revision" integer NOT NULL,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_artifact_approval_events" ADD CONSTRAINT "assistant_artifact_approval_events_lineage_fk" FOREIGN KEY ("lineage_id") REFERENCES "adscale_app"."assistant_artifact_lineages"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_approval_events" ADD CONSTRAINT "assistant_artifact_approval_events_promoted_fk" FOREIGN KEY ("promoted_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE restrict;
ALTER TABLE "adscale_app"."assistant_artifact_approval_events" ADD CONSTRAINT "assistant_artifact_approval_events_previous_fk" FOREIGN KEY ("previous_official_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE restrict;
ALTER TABLE "adscale_app"."assistant_artifact_approval_events" ADD CONSTRAINT "assistant_artifact_approval_events_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_approval_events" ADD CONSTRAINT "assistant_artifact_approval_events_client_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_approval_events" ADD CONSTRAINT "assistant_artifact_approval_events_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_approval_events" ADD CONSTRAINT "assistant_artifact_approval_events_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_creative_fk" FOREIGN KEY ("creative_target_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_lineage_fk" FOREIGN KEY ("plan_lineage_id") REFERENCES "adscale_app"."assistant_artifact_lineages"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_linked_fk" FOREIGN KEY ("linked_plan_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_official_fk" FOREIGN KEY ("compared_official_plan_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_client_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_comparison_acknowledgements" ADD CONSTRAINT "assistant_artifact_comparison_ack_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_artifact_approval_events_operation_lineage_uidx" ON "adscale_app"."assistant_artifact_approval_events" ("operation_id", "lineage_id");
CREATE INDEX IF NOT EXISTS "assistant_artifact_approval_events_scope_idx" ON "adscale_app"."assistant_artifact_approval_events" ("workspace_id", "client_profile_id", "campaign_id", "thread_id");
CREATE INDEX IF NOT EXISTS "assistant_artifact_approval_events_lineage_created_idx" ON "adscale_app"."assistant_artifact_approval_events" ("lineage_id", "created_at");
CREATE INDEX IF NOT EXISTS "assistant_artifact_comparison_ack_scope_idx" ON "adscale_app"."assistant_artifact_comparison_acknowledgements" ("workspace_id", "client_profile_id", "campaign_id", "thread_id");
CREATE INDEX IF NOT EXISTS "assistant_artifact_comparison_ack_plan_created_idx" ON "adscale_app"."assistant_artifact_comparison_acknowledgements" ("plan_lineage_id", "created_at");
