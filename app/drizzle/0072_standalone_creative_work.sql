CREATE TABLE IF NOT EXISTS "adscale_app"."creative_work_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "created_by_user_id" text NOT NULL REFERENCES "adscale_app"."user"("id") ON DELETE RESTRICT,
  "tool_kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "brief" jsonb NOT NULL,
  "format" text NOT NULL,
  "copy" jsonb,
  "identity_snapshot" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "creative_work_items_tool_kind_check" CHECK ("tool_kind" = 'social_post'),
  CONSTRAINT "creative_work_items_status_check" CHECK ("status" in ('draft','ready','generating','partial','completed','failed')),
  CONSTRAINT "creative_work_items_format_check" CHECK ("format" in ('1:1','4:5','9:16'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_items_scope_idx"
  ON "adscale_app"."creative_work_items" ("workspace_id", "client_profile_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."creative_work_outputs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "work_item_id" uuid NOT NULL REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE CASCADE,
  "creative_level" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "output_key" text,
  "cost" integer,
  "failure_code" text,
  "quality" jsonb,
  "is_selected" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "creative_work_outputs_level_check" CHECK ("creative_level" in ('conservative','balanced','bold')),
  CONSTRAINT "creative_work_outputs_status_check" CHECK ("status" in ('queued','processing','completed','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_outputs_level_uq"
  ON "adscale_app"."creative_work_outputs" ("work_item_id", "creative_level");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_outputs_selected_uq"
  ON "adscale_app"."creative_work_outputs" ("work_item_id") WHERE "is_selected" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_outputs_scope_idx"
  ON "adscale_app"."creative_work_outputs" ("workspace_id", "work_item_id", "status");