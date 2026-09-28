ALTER TABLE "adscale_equipe"."equipe_items" DROP CONSTRAINT "equipe_items_status_check";--> statement-breakpoint
UPDATE "adscale_equipe"."equipe_items" SET "status" = 'awaiting_approval' WHERE "status" IN ('draft', 'pending_approval');--> statement-breakpoint
UPDATE "adscale_equipe"."equipe_items" SET "status" = 'adjusting' WHERE "status" IN ('in_production', 'in_review');--> statement-breakpoint
UPDATE "adscale_equipe"."equipe_items" SET "status" = 'available_for_download' WHERE "status" = 'approved';--> statement-breakpoint
UPDATE "adscale_equipe"."equipe_items" SET "status" = 'cancelled' WHERE "status" = 'canceled';--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ALTER COLUMN "status" SET DEFAULT 'awaiting_approval';--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_item_versions" ADD COLUMN "destination" text;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD COLUMN "destination" text;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD CONSTRAINT "equipe_escalations_item_id_equipe_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "adscale_equipe"."equipe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipe_escalations_item_idx" ON "adscale_equipe"."equipe_escalations" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD CONSTRAINT "equipe_items_status_check" CHECK ("adscale_equipe"."equipe_items"."status" in ('awaiting_approval', 'adjusting', 'scheduled', 'held', 'missed_window', 'do_not_publish', 'cancelled', 'sending', 'verifying', 'published', 'failed', 'available_for_download', 'published_declared', 'published_confirmed'));