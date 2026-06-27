ALTER TABLE "adscale_app"."assistant_action_records" ADD COLUMN IF NOT EXISTS "source_flow_revision" integer;
--> statement-breakpoint
ALTER TABLE "adscale_app"."assistant_action_records" ADD COLUMN IF NOT EXISTS "source_snapshot_digest" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_action_records_flow_binding_idx" ON "adscale_app"."assistant_action_records" ("thread_id", "source_flow_revision");
