CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_guided_flows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"path" text NOT NULL,
	"status" text NOT NULL,
	"current_step" text NOT NULL,
	"slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"missing_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"campaign_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flows" ADD CONSTRAINT "assistant_guided_flows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flows" ADD CONSTRAINT "assistant_guided_flows_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flows" ADD CONSTRAINT "assistant_guided_flows_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flows" ADD CONSTRAINT "assistant_guided_flows_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_guided_flows_thread_id_uidx" ON "adscale_app"."assistant_guided_flows" ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flows_workspace_id_idx" ON "adscale_app"."assistant_guided_flows" ("workspace_id");
