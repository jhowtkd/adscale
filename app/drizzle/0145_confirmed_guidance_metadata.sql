ALTER TABLE "adscale_app"."calibration_rules" ADD COLUMN "confirmed_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_rules" ADD COLUMN "metadata_confirmed_by" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_rules" ADD COLUMN "metadata_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_rules" ADD CONSTRAINT "calibration_rules_metadata_confirmed_by_user_id_fk" FOREIGN KEY ("metadata_confirmed_by") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_rules" ADD CONSTRAINT "calibration_rules_metadata_confirmation_check" CHECK (
      ("adscale_app"."calibration_rules"."confirmed_metadata" is null and "adscale_app"."calibration_rules"."metadata_confirmed_by" is null and "adscale_app"."calibration_rules"."metadata_confirmed_at" is null)
      or ("adscale_app"."calibration_rules"."confirmed_metadata" is not null and "adscale_app"."calibration_rules"."metadata_confirmed_by" is not null and "adscale_app"."calibration_rules"."metadata_confirmed_at" is not null)
    );