CREATE TABLE IF NOT EXISTS "adscale_app"."creative_work_refinement_attempts" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "work_item_id" uuid NOT NULL,
  "root_output_id" uuid,
  "parent_output_id" uuid,
  "root_slide_id" uuid,
  "parent_slide_id" uuid,
  "attempt" integer NOT NULL,
  "revision_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'claimed',
  "unit_credits" integer NOT NULL DEFAULT 0,
  "output_id" uuid,
  "slide_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_work_item_id_creative_work_items_id_fk"
  FOREIGN KEY ("work_item_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_output_id_creative_work_outputs_id_fk"
  FOREIGN KEY ("output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_slide_id_creative_work_carousel_slides_id_fk"
  FOREIGN KEY ("slide_id") REFERENCES "adscale_app"."creative_work_carousel_slides"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_root_output_fk"
  FOREIGN KEY ("root_output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_parent_output_fk"
  FOREIGN KEY ("parent_output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_root_slide_fk"
  FOREIGN KEY ("root_slide_id") REFERENCES "adscale_app"."creative_work_carousel_slides"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_parent_slide_fk"
  FOREIGN KEY ("parent_slide_id") REFERENCES "adscale_app"."creative_work_carousel_slides"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_attempt_check"
  CHECK ("attempt" in (1,2));
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_status_check"
  CHECK ("status" in ('claimed','dispatched','completed','failed'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_credits_check"
  CHECK ("unit_credits" >= 0);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_root_check"
  CHECK (("root_output_id" is null) != ("root_slide_id" is null));
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_refinement_attempts"
  ADD CONSTRAINT "creative_work_refinement_attempts_parent_check"
  CHECK (("root_output_id" is null) = ("parent_output_id" is null) and ("root_slide_id" is null) = ("parent_slide_id" is null));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_refinement_attempts_key_uq"
  ON "adscale_app"."creative_work_refinement_attempts" ("revision_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_refinement_attempts_output_uq"
  ON "adscale_app"."creative_work_refinement_attempts" ("work_item_id", "root_output_id", "attempt")
  WHERE "root_output_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_refinement_attempts_slide_uq"
  ON "adscale_app"."creative_work_refinement_attempts" ("work_item_id", "root_slide_id", "attempt")
  WHERE "root_slide_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_refinement_attempts_scope_idx"
  ON "adscale_app"."creative_work_refinement_attempts" ("workspace_id", "work_item_id");
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items"
  ADD COLUMN IF NOT EXISTS "art_refinement_state" jsonb;
