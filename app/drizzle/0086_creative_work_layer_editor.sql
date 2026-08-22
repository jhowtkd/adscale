ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN IF NOT EXISTS "layer_editor" jsonb;

CREATE INDEX IF NOT EXISTS "usage_events_workspace_type_created_idx"
  ON "adscale_app"."usage_events" ("workspace_id", "type", "created_at");
