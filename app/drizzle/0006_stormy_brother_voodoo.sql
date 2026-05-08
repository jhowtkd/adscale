CREATE TABLE "adscale_app"."campaign_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"client" text,
	"product" text,
	"objective" text,
	"audience" text,
	"platforms" text[],
	"tone" text,
	"offer" text,
	"constraints" text,
	"notes" text,
	"generation_mode" text DEFAULT 'art_variation' NOT NULL,
	"creative_level" text DEFAULT 'balanced' NOT NULL,
	"style_intensity" text DEFAULT 'medium' NOT NULL,
	"cta_variants" text[],
	"target_formats" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN "is_preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."campaign_templates" ADD CONSTRAINT "campaign_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_templates_workspace_id_idx" ON "adscale_app"."campaign_templates" USING btree ("workspace_id");