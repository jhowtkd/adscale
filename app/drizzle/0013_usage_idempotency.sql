ALTER TABLE "adscale_app"."usage_events" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_events_idempotency_key_unique" ON "adscale_app"."usage_events" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_idempotency_key_idx" ON "adscale_app"."usage_events" USING btree ("idempotency_key");
