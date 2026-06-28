ALTER TABLE "adscale_app"."derivations" ADD COLUMN "style_asset_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "derivations_workspace_created_at_idx" ON "adscale_app"."derivations" USING btree ("workspace_id","created_at");
