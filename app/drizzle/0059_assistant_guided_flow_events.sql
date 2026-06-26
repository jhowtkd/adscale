CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_guided_flow_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"guided_flow_id" uuid,
	"path" text NOT NULL,
	"step" text NOT NULL,
	"event_key" text NOT NULL,
	"blocker_category" text,
	"action_record_id" uuid,
	"campaign_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_events" ADD CONSTRAINT "assistant_guided_flow_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_events" ADD CONSTRAINT "assistant_guided_flow_events_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_events" ADD CONSTRAINT "assistant_guided_flow_events_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_events" ADD CONSTRAINT "assistant_guided_flow_events_guided_flow_id_assistant_guided_flows_id_fk" FOREIGN KEY ("guided_flow_id") REFERENCES "adscale_app"."assistant_guided_flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_events" ADD CONSTRAINT "assistant_guided_flow_events_action_record_id_assistant_action_records_id_fk" FOREIGN KEY ("action_record_id") REFERENCES "adscale_app"."assistant_action_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_events" ADD CONSTRAINT "assistant_guided_flow_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_events_workspace_occurred_idx" ON "adscale_app"."assistant_guided_flow_events" ("workspace_id", "occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_events_workspace_client_path_occurred_idx" ON "adscale_app"."assistant_guided_flow_events" ("workspace_id", "client_profile_id", "path", "occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_events_thread_occurred_idx" ON "adscale_app"."assistant_guided_flow_events" ("thread_id", "occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_events_guided_flow_occurred_idx" ON "adscale_app"."assistant_guided_flow_events" ("guided_flow_id", "occurred_at");
