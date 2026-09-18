CREATE TABLE IF NOT EXISTS "adscale_app"."brand_training_sessions" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "created_by_user_id" text NOT NULL,
  "base_version_id" uuid,
  "revision" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'review',
  "candidate" jsonb NOT NULL,
  "rounds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "extension_count" integer NOT NULL DEFAULT 0,
  "activated_version_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_training_sessions"
  ADD CONSTRAINT "brand_training_sessions_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_training_sessions"
  ADD CONSTRAINT "brand_training_sessions_client_profile_id_client_profiles_id_fk"
  FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_training_sessions"
  ADD CONSTRAINT "brand_training_sessions_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_training_sessions"
  ADD CONSTRAINT "brand_training_sessions_base_version_id_brand_knowledge_versions_id_fk"
  FOREIGN KEY ("base_version_id") REFERENCES "adscale_app"."brand_knowledge_versions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_training_sessions"
  ADD CONSTRAINT "brand_training_sessions_activated_version_id_brand_knowledge_versions_id_fk"
  FOREIGN KEY ("activated_version_id") REFERENCES "adscale_app"."brand_knowledge_versions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_training_sessions"
  ADD CONSTRAINT "brand_training_sessions_status_check"
  CHECK ("status" in ('review','calibrating','pending','activated','archived'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_training_sessions_scope_idx"
  ON "adscale_app"."brand_training_sessions" ("workspace_id", "client_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_training_sessions_open_uq"
  ON "adscale_app"."brand_training_sessions" ("workspace_id", "client_profile_id")
  WHERE "status" not in ('archived','activated');
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN IF NOT EXISTS "training_session_id" uuid;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN IF NOT EXISTS "training_round" integer;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN IF NOT EXISTS "training_slot" integer;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD CONSTRAINT "creative_work_items_training_session_id_brand_training_sessions_id_fk"
  FOREIGN KEY ("training_session_id") REFERENCES "adscale_app"."brand_training_sessions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD CONSTRAINT "creative_work_items_training_link_check"
  CHECK (("training_session_id" is null and "training_round" is null and "training_slot" is null) or ("training_session_id" is not null and "training_round" is not null and "training_slot" is not null));
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD CONSTRAINT "creative_work_items_training_round_check"
  CHECK ("training_round" is null or "training_round" > 0);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD CONSTRAINT "creative_work_items_training_slot_range_check"
  CHECK ("training_slot" is null or ("training_slot" >= 0 and "training_slot" <= 3));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_items_training_slot_uq"
  ON "adscale_app"."creative_work_items" ("training_session_id", "training_round", "training_slot")
  WHERE "training_session_id" is not null;
