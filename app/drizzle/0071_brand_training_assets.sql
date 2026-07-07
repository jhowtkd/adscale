ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "training_category" text;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "usage_mode" text;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "training_analysis" jsonb;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "review_status" text;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_references" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_references_reviewed_by_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "adscale_app"."client_references"
      ADD CONSTRAINT "client_references_reviewed_by_user_id_user_id_fk"
      FOREIGN KEY ("reviewed_by_user_id") REFERENCES "adscale_app"."user"("id")
      ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_references_training_lookup_idx"
  ON "adscale_app"."client_references" ("workspace_id", "client_profile_id", "review_status");