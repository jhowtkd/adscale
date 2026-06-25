-- Allow multiple client_profiles per workspace (drop one-profile-per-workspace constraint)
ALTER TABLE "adscale_app"."client_profiles" DROP CONSTRAINT IF EXISTS "client_profiles_workspace_id_unique";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_profiles_workspace_id_idx" ON "adscale_app"."client_profiles" USING btree ("workspace_id");
