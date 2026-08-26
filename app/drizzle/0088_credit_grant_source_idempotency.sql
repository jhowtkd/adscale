DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "adscale_app"."credit_grants"
    WHERE "source_id" IS NOT NULL
    GROUP BY "source", "source_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate credit grant source ids must be reconciled before migration 0088';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_grants_source_source_id_uidx"
ON "adscale_app"."credit_grants" USING btree ("source", "source_id")
WHERE "source_id" IS NOT NULL;
