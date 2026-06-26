CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_guided_flow_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"guided_flow_id" uuid,
	"path" text NOT NULL,
	"step" text NOT NULL,
	"feedback_kind" text NOT NULL,
	"rating" text NOT NULL,
	"reason_text" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_feedback" ADD CONSTRAINT "assistant_guided_flow_feedback_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_feedback" ADD CONSTRAINT "assistant_guided_flow_feedback_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_feedback" ADD CONSTRAINT "assistant_guided_flow_feedback_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_feedback" ADD CONSTRAINT "assistant_guided_flow_feedback_guided_flow_id_assistant_guided_flows_id_fk" FOREIGN KEY ("guided_flow_id") REFERENCES "adscale_app"."assistant_guided_flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_feedback" ADD CONSTRAINT "assistant_guided_flow_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_feedback_thread_created_idx" ON "adscale_app"."assistant_guided_flow_feedback" ("thread_id", "created_at");
