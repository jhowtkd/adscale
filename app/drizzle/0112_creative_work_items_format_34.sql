ALTER TABLE "adscale_app"."creative_work_items" DROP CONSTRAINT IF EXISTS "creative_work_items_format_check";
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_items" ADD CONSTRAINT "creative_work_items_format_check" CHECK ("format" IN ('1:1','4:5','9:16','3:4'));
