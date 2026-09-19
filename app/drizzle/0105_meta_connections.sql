CREATE TABLE IF NOT EXISTS "adscale_app"."meta_connections" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'ativa',
  "token_ciphertext" text,
  "token_updated_at" timestamp,
  "last_sync_at" timestamp,
  "last_sync_error" text,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."meta_connections"
  ADD CONSTRAINT "meta_connections_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."meta_connections"
  ADD CONSTRAINT "meta_connections_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "adscale_app"."meta_connections"
  ADD CONSTRAINT "meta_connections_status_check"
  CHECK ("status" in ('ativa','expirada','revogada','com_erro'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_connections_workspace_id_idx"
  ON "adscale_app"."meta_connections" ("workspace_id");
