ALTER TABLE "adscale_equipe"."equipe_fronts" DROP CONSTRAINT "equipe_fronts_status_check";--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_rounds" ADD COLUMN "batch_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_rounds" ADD COLUMN "week_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_fronts" ADD COLUMN "calibration_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_rounds" ADD CONSTRAINT "equipe_calibration_rounds_batch_id_equipe_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "adscale_equipe"."equipe_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_calibration_rounds_front_week_uq" ON "adscale_equipe"."equipe_calibration_rounds" USING btree ("front_id","week_key");--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_fronts" ADD CONSTRAINT "equipe_fronts_status_check" CHECK ("adscale_equipe"."equipe_fronts"."status" in ('draft', 'calibrating', 'released', 'scope_decision', 'paused', 'closed'));