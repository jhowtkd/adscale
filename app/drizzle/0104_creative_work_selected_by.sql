ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN IF NOT EXISTS "selected_by" text;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD CONSTRAINT "creative_work_outputs_selected_by_check"
  CHECK ("selected_by" in ('operator','agent'));
