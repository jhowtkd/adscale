CREATE INDEX IF NOT EXISTS "campaign_templates_catalog_cursor_idx"
  ON "adscale_app"."campaign_templates" ("workspace_id", "updated_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_assets_catalog_cursor_idx"
  ON "adscale_app"."workspace_assets" ("source", "created_at", "id");
