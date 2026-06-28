CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_creative_feedback_drafts" (
  "thread_id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "draft_text" text NOT NULL DEFAULT '',
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_creative_feedback_drafts" ADD CONSTRAINT "assistant_creative_feedback_drafts_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_creative_feedback_drafts" ADD CONSTRAINT "assistant_creative_feedback_drafts_client_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_creative_feedback_drafts" ADD CONSTRAINT "assistant_creative_feedback_drafts_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade;
ALTER TABLE "adscale_app"."assistant_creative_feedback_drafts" ADD CONSTRAINT "assistant_creative_feedback_drafts_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_creative_feedback_drafts_scope_idx" ON "adscale_app"."assistant_creative_feedback_drafts" ("workspace_id", "client_profile_id", "campaign_id", "thread_id");
