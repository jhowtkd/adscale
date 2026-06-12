CREATE SCHEMA "adscale_app";
--> statement-breakpoint
CREATE TABLE "adscale_app"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."campaign_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"size" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client" text,
	"product" text,
	"objective" text,
	"audience" text,
	"platforms" text[],
	"tone" text,
	"offer" text,
	"constraints" text,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."creative_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"strategy" text,
	"angles" text[],
	"hooks" text[],
	"ctas" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."derivations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid,
	"parent_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"prompt" text,
	"output_key" text,
	"format" text,
	"cost" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"derivation_id" uuid NOT NULL,
	"format" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."workspace_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."activity_events" ADD CONSTRAINT "activity_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."activity_events" ADD CONSTRAINT "activity_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaign_assets" ADD CONSTRAINT "campaign_assets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaign_assets" ADD CONSTRAINT "campaign_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_plans" ADD CONSTRAINT "creative_plans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_plans" ADD CONSTRAINT "creative_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD CONSTRAINT "derivations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD CONSTRAINT "derivations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD CONSTRAINT "derivations_plan_id_creative_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "adscale_app"."creative_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD CONSTRAINT "derivations_parent_id_derivations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."exports" ADD CONSTRAINT "exports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."exports" ADD CONSTRAINT "exports_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "adscale_app"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_workspace_id_idx" ON "adscale_app"."activity_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "activity_events_user_id_idx" ON "adscale_app"."activity_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "campaign_assets_campaign_id_idx" ON "adscale_app"."campaign_assets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_assets_workspace_id_idx" ON "adscale_app"."campaign_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "campaigns_workspace_id_idx" ON "adscale_app"."campaigns" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "creative_plans_campaign_id_idx" ON "adscale_app"."creative_plans" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "creative_plans_workspace_id_idx" ON "adscale_app"."creative_plans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "derivations_campaign_id_idx" ON "adscale_app"."derivations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "derivations_workspace_id_idx" ON "adscale_app"."derivations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "derivations_plan_id_idx" ON "adscale_app"."derivations" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "derivations_parent_id_idx" ON "adscale_app"."derivations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "exports_workspace_id_idx" ON "adscale_app"."exports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "exports_derivation_id_idx" ON "adscale_app"."exports" USING btree ("derivation_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "adscale_app"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_events_workspace_id_idx" ON "adscale_app"."usage_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_id_idx" ON "adscale_app"."workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "adscale_app"."workspace_members" USING btree ("user_id");