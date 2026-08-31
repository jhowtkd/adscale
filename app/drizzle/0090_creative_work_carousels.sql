-- #231: server-owned carousel slide versions. Widen the creative work tool
-- kinds, add deck approval/quality columns to the aggregate, and create the
-- versioned slide table. creative_work_outputs is intentionally untouched.
ALTER TABLE "adscale_app"."creative_work_items"
  DROP CONSTRAINT "creative_work_items_tool_kind_check";
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD CONSTRAINT "creative_work_items_tool_kind_check"
  CHECK ("tool_kind" IN ('social_post','variations','single','format_adaptation','restyle','carousel'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN "carousel_approved_revision" text,
  ADD COLUMN "carousel_quality" jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_items_id_workspace_uq"
  ON "adscale_app"."creative_work_items" ("id", "workspace_id");
--> statement-breakpoint
CREATE TABLE "adscale_app"."creative_work_carousel_slides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "work_item_id" uuid NOT NULL,
  "lineage_id" uuid NOT NULL,
  "parent_slide_id" uuid,
  "version_number" integer NOT NULL,
  "deck_revision" text NOT NULL,
  "position" integer NOT NULL,
  "role" text NOT NULL,
  "primary_text" text NOT NULL,
  "secondary_text" text,
  "copy_authority" text NOT NULL,
  "source_fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "layout_family" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "provider_base_key" text,
  "output_key" text,
  "preview_key" text,
  "visual_contract_hash" text NOT NULL,
  "anchor_key" text,
  "generation_operation_key" text NOT NULL,
  "error_code" text,
  "quality" jsonb,
  "is_current" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "queued_at" timestamp,
  "terminal_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "creative_work_carousel_slides_status_check" CHECK ("status" in ('draft','queued','processing','completed','failed')),
  CONSTRAINT "creative_work_carousel_slides_role_check" CHECK ("role" in ('hook','context','problem','argument','evidence','method','bridge','closing','cta')),
  CONSTRAINT "creative_work_carousel_slides_copy_authority_check" CHECK ("copy_authority" in ('user_input','ai_proposal','human_edit')),
  CONSTRAINT "creative_work_carousel_slides_layout_family_check" CHECK ("layout_family" in ('impact','development','respite')),
  CONSTRAINT "creative_work_carousel_slides_version_positive_check" CHECK ("version_number" > 0),
  CONSTRAINT "creative_work_carousel_slides_position_positive_check" CHECK ("position" > 0),
  CONSTRAINT "creative_work_carousel_slides_parent_self_check" CHECK ("parent_slide_id" is null or "parent_slide_id" <> "id"),
  CONSTRAINT "creative_work_carousel_slides_work_item_fk" FOREIGN KEY ("work_item_id","workspace_id") REFERENCES "adscale_app"."creative_work_items"("id","workspace_id") ON DELETE CASCADE,
  CONSTRAINT "creative_work_carousel_slides_parent_fk" FOREIGN KEY ("parent_slide_id") REFERENCES "adscale_app"."creative_work_carousel_slides"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_carousel_slides_current_uq"
  ON "adscale_app"."creative_work_carousel_slides" ("work_item_id", "lineage_id", "position")
  WHERE "is_current" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_carousel_slides_version_uq"
  ON "adscale_app"."creative_work_carousel_slides" ("work_item_id", "lineage_id", "version_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_carousel_slides_operation_uq"
  ON "adscale_app"."creative_work_carousel_slides" ("work_item_id", "generation_operation_key");
--> statement-breakpoint
CREATE INDEX "creative_work_carousel_slides_scope_idx"
  ON "adscale_app"."creative_work_carousel_slides" ("workspace_id", "work_item_id");
