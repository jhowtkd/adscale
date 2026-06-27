ALTER TABLE "adscale_app"."assistant_guided_flows" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flows" ADD COLUMN IF NOT EXISTS "schema_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flows" ADD COLUMN IF NOT EXISTS "recoverable_error" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."assistant_guided_flow_transitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guided_flow_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_id" text NOT NULL,
	"command_type" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"result_revision" integer NOT NULL,
	"previous_step" text,
	"next_step" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_transitions" ADD CONSTRAINT "assistant_guided_flow_transitions_guided_flow_id_assistant_guided_flows_id_fk" FOREIGN KEY ("guided_flow_id") REFERENCES "adscale_app"."assistant_guided_flows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_guided_flow_transitions" ADD CONSTRAINT "assistant_guided_flow_transitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_guided_flow_transitions_flow_command_uidx" ON "adscale_app"."assistant_guided_flow_transitions" ("guided_flow_id", "command_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_guided_flow_transitions_guided_flow_created_idx" ON "adscale_app"."assistant_guided_flow_transitions" ("guided_flow_id", "created_at");
