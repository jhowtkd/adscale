CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_guided_flow_staging_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"campaign_id" uuid,
	"path" text NOT NULL,
	"environment" text NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"check_key" text NOT NULL,
	"verdict" text NOT NULL,
	"safe_notes" text,
	"reference_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_staging_evidence" ADD CONSTRAINT "assistant_guided_flow_staging_evidence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_staging_evidence" ADD CONSTRAINT "assistant_guided_flow_staging_evidence_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_staging_evidence" ADD CONSTRAINT "assistant_guided_flow_staging_evidence_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_staging_evidence" ADD CONSTRAINT "assistant_guided_flow_staging_evidence_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_staging_evidence_workspace_created_idx" ON "adscale_app"."assistant_guided_flow_staging_evidence" ("workspace_id", "created_at");
