-- share_links existed in Drizzle snapshots but was never applied in SQL (phase 64 orphan).
CREATE TABLE IF NOT EXISTS "adscale_app"."share_links" (
	"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
	"token" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"derivation_ids" text[] NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_token_unique') THEN
    ALTER TABLE "adscale_app"."share_links" ADD CONSTRAINT "share_links_token_unique" UNIQUE("token");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_campaign_id_campaigns_id_fk') THEN
    ALTER TABLE "adscale_app"."share_links" ADD CONSTRAINT "share_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "adscale_app"."share_links" ADD CONSTRAINT "share_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_token_idx" ON "adscale_app"."share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_campaign_id_idx" ON "adscale_app"."share_links" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_workspace_id_idx" ON "adscale_app"."share_links" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "quality_verdict" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "hard_failures" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "polish_suggestions" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "quality_gated_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "creative_contract" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "regeneration_correction_brief" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "prompt_provenance" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "style_asset_id" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivations" ADD COLUMN IF NOT EXISTS "input_prompt" text;
