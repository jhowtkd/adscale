ALTER TABLE "adscale_equipe"."equipe_escalations" DROP CONSTRAINT "equipe_escalations_severity_check";--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" DROP CONSTRAINT "equipe_escalations_status_check";--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD COLUMN "parts" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_exceptions" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD CONSTRAINT "equipe_escalations_severity_check" CHECK ("adscale_equipe"."equipe_escalations"."severity" in ('low', 'medium', 'high', 'critical', 'critical_cross_account'));--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD CONSTRAINT "equipe_escalations_status_check" CHECK ("adscale_equipe"."equipe_escalations"."status" in ('open', 'acknowledged', 'resolving', 'awaiting_client', 'resolved', 'merged', 'closed'));