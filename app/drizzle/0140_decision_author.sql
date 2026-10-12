ALTER TABLE "adscale_app"."calibration_signals" ALTER COLUMN "reviewer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_signals" ADD COLUMN "author_type" text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_signals" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_signals" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_signals" ADD COLUMN "equipe_event_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ADD COLUMN "author_type" text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ADD COLUMN "equipe_event_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_signals" ADD CONSTRAINT "calibration_signals_equipe_event_id_equipe_events_id_fk" FOREIGN KEY ("equipe_event_id") REFERENCES "adscale_equipe"."equipe_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ADD CONSTRAINT "output_decision_events_equipe_event_id_equipe_events_id_fk" FOREIGN KEY ("equipe_event_id") REFERENCES "adscale_equipe"."equipe_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_signals" ADD CONSTRAINT "calibration_signals_author_type_check" CHECK ("adscale_app"."calibration_signals"."author_type" in ('human', 'agent', 'equipe_actor'));--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_signals" ADD CONSTRAINT "calibration_signals_author_reference_check" CHECK (
      ("adscale_app"."calibration_signals"."author_type" in ('human', 'agent') and "adscale_app"."calibration_signals"."reviewer_id" is not null)
      or ("adscale_app"."calibration_signals"."author_type" = 'equipe_actor' and "adscale_app"."calibration_signals"."actor_id" is not null and length(trim("adscale_app"."calibration_signals"."actor_id")) > 0
        and "adscale_app"."calibration_signals"."actor_role" is not null and length(trim("adscale_app"."calibration_signals"."actor_role")) > 0 and "adscale_app"."calibration_signals"."equipe_event_id" is not null)
    );--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ADD CONSTRAINT "output_decision_events_author_type_check" CHECK ("adscale_app"."output_decision_events"."author_type" in ('human', 'agent', 'equipe_actor'));--> statement-breakpoint
ALTER TABLE "adscale_app"."output_decision_events" ADD CONSTRAINT "output_decision_events_author_reference_check" CHECK (
      ("adscale_app"."output_decision_events"."author_type" in ('human', 'agent') and "adscale_app"."output_decision_events"."user_id" is not null)
      or ("adscale_app"."output_decision_events"."author_type" = 'equipe_actor' and "adscale_app"."output_decision_events"."actor_id" is not null and length(trim("adscale_app"."output_decision_events"."actor_id")) > 0
        and "adscale_app"."output_decision_events"."actor_role" is not null and length(trim("adscale_app"."output_decision_events"."actor_role")) > 0 and "adscale_app"."output_decision_events"."equipe_event_id" is not null)
    );