ALTER TABLE "adscale_app"."client_references"
  ADD COLUMN IF NOT EXISTS "rejection_reason" jsonb;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_references_review_status_check'
  ) THEN
    ALTER TABLE "adscale_app"."client_references"
      ADD CONSTRAINT "client_references_review_status_check"
      CHECK (
        "review_status" IS NULL
        OR "review_status" IN ('pending_analysis', 'pending_approval', 'approved', 'archived', 'rejected')
      );
  END IF;
END $$;
