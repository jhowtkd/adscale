CREATE TABLE IF NOT EXISTS "adscale_app"."visual_recipes" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "document" jsonb NOT NULL,
  "origin_work_id" uuid NOT NULL,
  "origin_output_id" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."visual_recipes"
  ADD CONSTRAINT "visual_recipes_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."visual_recipes"
  ADD CONSTRAINT "visual_recipes_client_profile_id_client_profiles_id_fk"
  FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."visual_recipes"
  ADD CONSTRAINT "visual_recipes_origin_work_id_creative_work_items_id_fk"
  FOREIGN KEY ("origin_work_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "adscale_app"."visual_recipes"
  ADD CONSTRAINT "visual_recipes_origin_output_id_creative_work_outputs_id_fk"
  FOREIGN KEY ("origin_output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_recipes_brand_cursor_idx"
  ON "adscale_app"."visual_recipes" ("workspace_id", "client_profile_id", "updated_at", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "visual_recipes_origin_output_uq"
  ON "adscale_app"."visual_recipes" ("origin_output_id");
