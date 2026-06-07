CREATE TABLE "adscale_app"."beta_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cohort_label" text,
	"assistance_level" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"operator_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_sessions" ADD CONSTRAINT "beta_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "beta_sessions_workspace_id_idx" ON "adscale_app"."beta_sessions" USING btree ("workspace_id");
--> statement-breakpoint
CREATE TABLE "adscale_app"."beta_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"session_id" uuid,
	"event_key" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'client' NOT NULL,
	"campaign_id" uuid,
	"derivation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_analytics_events" ADD CONSTRAINT "beta_analytics_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_analytics_events" ADD CONSTRAINT "beta_analytics_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_analytics_events" ADD CONSTRAINT "beta_analytics_events_session_id_beta_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "adscale_app"."beta_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_analytics_events" ADD CONSTRAINT "beta_analytics_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_analytics_events" ADD CONSTRAINT "beta_analytics_events_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "beta_analytics_events_workspace_created_idx" ON "adscale_app"."beta_analytics_events" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX "beta_analytics_events_session_id_idx" ON "adscale_app"."beta_analytics_events" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "beta_analytics_events_event_key_idx" ON "adscale_app"."beta_analytics_events" USING btree ("workspace_id","event_key","created_at");
