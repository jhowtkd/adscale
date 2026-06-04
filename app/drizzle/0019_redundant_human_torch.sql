CREATE TABLE IF NOT EXISTS "adscale_app"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"derivation_id" uuid,
	"campaign_id" uuid,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."persona_simulations" (
	"id" uuid PRIMARY KEY NOT NULL,
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
CREATE TABLE IF NOT EXISTS "adscale_app"."workspace_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"tags" jsonb,
	"ai_description" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "input_prompt" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."persona_simulations" ADD CONSTRAINT "persona_simulations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."persona_simulations" ADD CONSTRAINT "persona_simulations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_assets" ADD CONSTRAINT "workspace_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "adscale_app"."notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_workspace_id_idx" ON "adscale_app"."notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notifications_read_at_idx" ON "adscale_app"."notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "adscale_app"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "persona_simulations_source_idx" ON "adscale_app"."persona_simulations" USING btree ("workspace_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "workspace_assets_workspace_id_idx" ON "adscale_app"."workspace_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_assets_source_idx" ON "adscale_app"."workspace_assets" USING btree ("source");--> statement-breakpoint
CREATE INDEX "derivations_workspace_campaign_idx" ON "adscale_app"."derivations" USING btree ("workspace_id","campaign_id");--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD CONSTRAINT "client_profiles_workspace_id_unique" UNIQUE("workspace_id");
