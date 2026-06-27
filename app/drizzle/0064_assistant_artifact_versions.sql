CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_lineages" (
  "id" uuid PRIMARY KEY NOT NULL,
  "artifact_type" text NOT NULL,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "original_artifact_id" uuid NOT NULL,
  "origin" text NOT NULL,
  "format_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "lineage_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "source_version_id" uuid,
  "status" text DEFAULT 'ready' NOT NULL,
  "snapshot" jsonb NOT NULL,
  "provenance" jsonb NOT NULL,
  "feedback" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_lineage_heads" (
  "lineage_id" uuid PRIMARY KEY NOT NULL,
  "approved_current_version_id" uuid,
  "working_version_id" uuid,
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_artifact_proposals" (
  "id" uuid PRIMARY KEY NOT NULL,
  "lineage_id" uuid NOT NULL,
  "source_version_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "proposal_type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "payload" jsonb NOT NULL,
  "feedback" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "assistant_artifact_proposals_status_check" CHECK ("status" in ('pending', 'stale', 'confirmed', 'canceled'))
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_artifact_lineages" ADD CONSTRAINT "assistant_artifact_lineages_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_lineages" ADD CONSTRAINT "assistant_artifact_lineages_client_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_lineages" ADD CONSTRAINT "assistant_artifact_lineages_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_lineages" ADD CONSTRAINT "assistant_artifact_lineages_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_artifact_versions" ADD CONSTRAINT "assistant_artifact_versions_lineage_fk" FOREIGN KEY ("lineage_id") REFERENCES "adscale_app"."assistant_artifact_lineages"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_versions" ADD CONSTRAINT "assistant_artifact_versions_source_fk" FOREIGN KEY ("source_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE restrict;
ALTER TABLE "adscale_app"."assistant_artifact_versions" ADD CONSTRAINT "assistant_artifact_versions_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_versions" ADD CONSTRAINT "assistant_artifact_versions_client_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_versions" ADD CONSTRAINT "assistant_artifact_versions_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_versions" ADD CONSTRAINT "assistant_artifact_versions_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_artifact_lineage_heads" ADD CONSTRAINT "assistant_artifact_lineage_heads_lineage_fk" FOREIGN KEY ("lineage_id") REFERENCES "adscale_app"."assistant_artifact_lineages"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_lineage_heads" ADD CONSTRAINT "assistant_artifact_lineage_heads_approved_fk" FOREIGN KEY ("approved_current_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE set null;
ALTER TABLE "adscale_app"."assistant_artifact_lineage_heads" ADD CONSTRAINT "assistant_artifact_lineage_heads_working_fk" FOREIGN KEY ("working_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_artifact_proposals" ADD CONSTRAINT "assistant_artifact_proposals_lineage_fk" FOREIGN KEY ("lineage_id") REFERENCES "adscale_app"."assistant_artifact_lineages"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_proposals" ADD CONSTRAINT "assistant_artifact_proposals_source_fk" FOREIGN KEY ("source_version_id") REFERENCES "adscale_app"."assistant_artifact_versions"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_proposals" ADD CONSTRAINT "assistant_artifact_proposals_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_proposals" ADD CONSTRAINT "assistant_artifact_proposals_client_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_proposals" ADD CONSTRAINT "assistant_artifact_proposals_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_artifact_proposals" ADD CONSTRAINT "assistant_artifact_proposals_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_artifact_lineages_source_uidx" ON "adscale_app"."assistant_artifact_lineages" ("artifact_type", "original_artifact_id");
CREATE INDEX IF NOT EXISTS "assistant_artifact_lineages_scope_idx" ON "adscale_app"."assistant_artifact_lineages" ("workspace_id", "client_profile_id", "campaign_id", "thread_id");
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_artifact_versions_lineage_number_uidx" ON "adscale_app"."assistant_artifact_versions" ("lineage_id", "version_number");
CREATE INDEX IF NOT EXISTS "assistant_artifact_versions_scope_idx" ON "adscale_app"."assistant_artifact_versions" ("workspace_id", "client_profile_id", "campaign_id", "thread_id");
CREATE INDEX IF NOT EXISTS "assistant_artifact_versions_lineage_created_idx" ON "adscale_app"."assistant_artifact_versions" ("lineage_id", "created_at");
CREATE INDEX IF NOT EXISTS "assistant_artifact_proposals_scope_idx" ON "adscale_app"."assistant_artifact_proposals" ("workspace_id", "client_profile_id", "campaign_id", "thread_id");
CREATE INDEX IF NOT EXISTS "assistant_artifact_proposals_lineage_created_idx" ON "adscale_app"."assistant_artifact_proposals" ("lineage_id", "created_at");
