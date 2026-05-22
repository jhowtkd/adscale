-- Deduplicate client_profiles by workspace_id (keep most recently updated)
WITH ranked AS (
  SELECT
    id,
    workspace_id,
    ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY updated_at DESC) AS rn
  FROM "adscale_app"."client_profiles"
)
DELETE FROM "adscale_app"."client_profiles"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

--> statement-breakpoint

-- Add unique constraint on workspace_id
ALTER TABLE "adscale_app"."client_profiles" ADD CONSTRAINT "client_profiles_workspace_id_unique" UNIQUE ("workspace_id");
