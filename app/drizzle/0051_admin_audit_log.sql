CREATE TABLE "adscale_app"."admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_email" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "payload" jsonb,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'success',
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_target_idx" ON "adscale_app"."admin_audit_log" USING btree ("target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "adscale_app"."admin_audit_log" USING btree ("created_at");
