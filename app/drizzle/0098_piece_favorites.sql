CREATE TABLE IF NOT EXISTS "adscale_app"."piece_favorites" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "output_id" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."piece_favorites"
  ADD CONSTRAINT "piece_favorites_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."piece_favorites"
  ADD CONSTRAINT "piece_favorites_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."piece_favorites"
  ADD CONSTRAINT "piece_favorites_output_id_creative_work_outputs_id_fk"
  FOREIGN KEY ("output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "piece_favorites_user_output_uq"
  ON "adscale_app"."piece_favorites" ("user_id", "output_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "piece_favorites_workspace_user_idx"
  ON "adscale_app"."piece_favorites" ("workspace_id", "user_id", "created_at");
