CREATE TABLE IF NOT EXISTS "adscale_app"."mcp_workspace_tokens" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "prefix" text NOT NULL,
  "created_by_user_id" text NOT NULL,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."mcp_workspace_tokens"
  ADD CONSTRAINT "mcp_workspace_tokens_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."mcp_workspace_tokens"
  ADD CONSTRAINT "mcp_workspace_tokens_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_workspace_tokens_token_hash_uq"
  ON "adscale_app"."mcp_workspace_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_workspace_tokens_workspace_id_idx"
  ON "adscale_app"."mcp_workspace_tokens" ("workspace_id");
