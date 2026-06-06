CREATE TABLE "adscale_app"."workspace_progression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"level_key" text DEFAULT 'aprendiz' NOT NULL,
	"completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_action" jsonb NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"last_calculated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_progression_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_progression" ADD CONSTRAINT "workspace_progression_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_progression_workspace_id_idx" ON "adscale_app"."workspace_progression" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX "workspace_progression_level_key_idx" ON "adscale_app"."workspace_progression" USING btree ("level_key");
