CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"migrated_from_thread_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_record_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_action_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"status" text NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"job_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safe_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_threads" ADD CONSTRAINT "assistant_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_threads" ADD CONSTRAINT "assistant_threads_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_threads" ADD CONSTRAINT "assistant_threads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_threads" ADD CONSTRAINT "assistant_threads_migrated_from_fk" FOREIGN KEY ("migrated_from_thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_messages" ADD CONSTRAINT "assistant_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_messages" ADD CONSTRAINT "assistant_messages_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_action_records" ADD CONSTRAINT "assistant_action_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_action_records" ADD CONSTRAINT "assistant_action_records_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_action_records" ADD CONSTRAINT "assistant_action_records_message_id_assistant_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "adscale_app"."assistant_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_messages" ADD CONSTRAINT "assistant_messages_action_record_fk" FOREIGN KEY ("action_record_id") REFERENCES "adscale_app"."assistant_action_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_threads_workspace_id_idx" ON "adscale_app"."assistant_threads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_threads_client_profile_id_idx" ON "adscale_app"."assistant_threads" USING btree ("client_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_threads_campaign_id_idx" ON "adscale_app"."assistant_threads" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_threads_campaign_default_uidx" ON "adscale_app"."assistant_threads" USING btree ("workspace_id","campaign_id") WHERE "is_default" = true AND "campaign_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_messages_thread_sequence_idx" ON "adscale_app"."assistant_messages" USING btree ("thread_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_messages_workspace_id_idx" ON "adscale_app"."assistant_messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_action_records_workspace_id_idx" ON "adscale_app"."assistant_action_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_action_records_thread_status_idx" ON "adscale_app"."assistant_action_records" USING btree ("thread_id","status");
