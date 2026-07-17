ALTER TABLE "adscale_app"."creative_work_items" ADD COLUMN "draft_key" text;
ALTER TABLE "adscale_app"."creative_work_items" ADD COLUMN "title" text;
ALTER TABLE "adscale_app"."creative_work_items" ADD COLUMN "request" text;
ALTER TABLE "adscale_app"."creative_work_items" ADD COLUMN "campaign_id" uuid;
ALTER TABLE "adscale_app"."creative_work_items" ADD COLUMN "settings" jsonb;
ALTER TABLE "adscale_app"."creative_work_items" ADD COLUMN "input_snapshot" jsonb;
--> statement-breakpoint
UPDATE "adscale_app"."creative_work_items"
SET "title" = "brief"->>'theme',
    "request" = "brief"::text,
    "settings" = '{"targetFormats":[]}'::jsonb;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "adscale_app"."creative_work_items" ALTER COLUMN "request" SET NOT NULL;
ALTER TABLE "adscale_app"."creative_work_items" ALTER COLUMN "settings" SET NOT NULL;
ALTER TABLE "adscale_app"."creative_work_items" ALTER COLUMN "brief" DROP NOT NULL;
ALTER TABLE "adscale_app"."creative_work_items" ALTER COLUMN "format" SET DEFAULT '4:5';
ALTER TABLE "adscale_app"."creative_work_items" ADD CONSTRAINT "creative_work_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE SET NULL;
ALTER TABLE "adscale_app"."creative_work_items" DROP CONSTRAINT "creative_work_items_tool_kind_check";
ALTER TABLE "adscale_app"."creative_work_items" ADD CONSTRAINT "creative_work_items_tool_kind_check" CHECK ("tool_kind" in ('social_post','variations','single','format_adaptation','restyle'));
CREATE UNIQUE INDEX "creative_work_items_draft_key_uq" ON "adscale_app"."creative_work_items" ("workspace_id", "created_by_user_id", "draft_key") WHERE "draft_key" is not null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "target_format" text;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "version_number" integer DEFAULT 1;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "parent_output_id" uuid;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "revision_instruction" text;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "revision_asset_id" uuid;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "retry_count" integer DEFAULT 0;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD COLUMN "operation_key" text;
--> statement-breakpoint
UPDATE "adscale_app"."creative_work_outputs" AS output
SET "target_format" = work."format",
    "version_number" = 1,
    "retry_count" = 0,
    "operation_key" = output."creative_level" || ':' || work."format" || ':1'
FROM "adscale_app"."creative_work_items" AS work
WHERE work."id" = output."work_item_id";
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_outputs" ALTER COLUMN "target_format" SET NOT NULL;
ALTER TABLE "adscale_app"."creative_work_outputs" ALTER COLUMN "version_number" SET NOT NULL;
ALTER TABLE "adscale_app"."creative_work_outputs" ALTER COLUMN "retry_count" SET NOT NULL;
ALTER TABLE "adscale_app"."creative_work_outputs" ALTER COLUMN "operation_key" SET NOT NULL;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD CONSTRAINT "creative_work_outputs_parent_fk" FOREIGN KEY ("parent_output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE SET NULL;
ALTER TABLE "adscale_app"."creative_work_outputs" ADD CONSTRAINT "creative_work_outputs_revision_asset_id_workspace_assets_id_fk" FOREIGN KEY ("revision_asset_id") REFERENCES "adscale_app"."workspace_assets"("id") ON DELETE SET NULL;
DROP INDEX "adscale_app"."creative_work_outputs_level_uq";
CREATE UNIQUE INDEX "creative_work_outputs_plan_uq" ON "adscale_app"."creative_work_outputs" ("work_item_id", "creative_level", "target_format", "version_number");
CREATE UNIQUE INDEX "creative_work_outputs_operation_uq" ON "adscale_app"."creative_work_outputs" ("work_item_id", "operation_key");
--> statement-breakpoint
CREATE TABLE "adscale_app"."creative_work_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "work_item_id" uuid NOT NULL REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE CASCADE,
  "asset_id" uuid REFERENCES "adscale_app"."workspace_assets"("id") ON DELETE CASCADE,
  "template_id" uuid REFERENCES "adscale_app"."campaign_templates"("id") ON DELETE CASCADE,
  "usage" text NOT NULL,
  "status" text NOT NULL,
  "content_analysis" jsonb,
  "style_analysis" jsonb,
  "failure_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "creative_work_sources_origin_check" CHECK (num_nonnulls("asset_id", "template_id") = 1),
  CONSTRAINT "creative_work_sources_usage_check" CHECK ("usage" in ('content','style','both')),
  CONSTRAINT "creative_work_sources_status_check" CHECK ("status" in ('uploaded','analyzing','ready','failed'))
);
CREATE INDEX "creative_work_sources_scope_idx" ON "adscale_app"."creative_work_sources" ("workspace_id", "work_item_id");
CREATE UNIQUE INDEX "creative_work_sources_asset_uq" ON "adscale_app"."creative_work_sources" ("work_item_id", "asset_id") WHERE "asset_id" is not null;
CREATE UNIQUE INDEX "creative_work_sources_template_uq" ON "adscale_app"."creative_work_sources" ("work_item_id", "template_id") WHERE "template_id" is not null;
