DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_references_review_status_check'
  ) THEN
    ALTER TABLE "adscale_app"."client_references"
      DROP CONSTRAINT "client_references_review_status_check";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_references_review_status_check'
  ) THEN
    ALTER TABLE "adscale_app"."client_references"
      ADD CONSTRAINT "client_references_review_status_check"
      CHECK (
        "review_status" IS NULL
        OR "review_status" IN ('pending_analysis', 'analysis_failed', 'pending_approval', 'approved', 'archived', 'rejected')
      );
  END IF;
END $$;
