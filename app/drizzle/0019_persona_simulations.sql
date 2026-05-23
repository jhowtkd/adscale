CREATE TABLE IF NOT EXISTS "adscale_app"."persona_simulations" (
	"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"results" jsonb,
	"cache_expires_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."persona_simulations" ADD CONSTRAINT "persona_simulations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."persona_simulations" ADD CONSTRAINT "persona_simulations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "persona_simulations_source_idx" ON "adscale_app"."persona_simulations" USING btree ("workspace_id","source_type","source_id");
