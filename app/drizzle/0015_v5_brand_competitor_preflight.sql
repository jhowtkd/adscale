CREATE TABLE "adscale_app"."competitor_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"platform" text,
	"website" text,
	"screenshots" text[],
	"strengths" jsonb,
	"weaknesses" jsonb,
	"differentiators" jsonb,
	"analysis" jsonb,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."campaign_assets" ADD COLUMN IF NOT EXISTS "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaign_assets" ADD COLUMN IF NOT EXISTS "analysis_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "adscale_app"."campaign_assets" ADD COLUMN IF NOT EXISTS "analyzed_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN IF NOT EXISTS "brand_colors" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN IF NOT EXISTS "brand_fonts" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN IF NOT EXISTS "logo_asset_key" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN IF NOT EXISTS "tone_of_voice" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN IF NOT EXISTS "prohibited_elements" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN IF NOT EXISTS "required_elements" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."competitor_analyses" ADD CONSTRAINT "competitor_analyses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."competitor_analyses" ADD CONSTRAINT "competitor_analyses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitor_analyses_workspace_id_idx" ON "adscale_app"."competitor_analyses" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "competitor_analyses_campaign_id_idx" ON "adscale_app"."competitor_analyses" USING btree ("campaign_id");
