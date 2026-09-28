CREATE TABLE "adscale_equipe"."equipe_notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"channels" jsonb NOT NULL,
	"delivered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_notification_deliveries" ADD CONSTRAINT "equipe_notification_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_notification_deliveries" ADD CONSTRAINT "equipe_notification_deliveries_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_notification_deliveries" ADD CONSTRAINT "equipe_notification_deliveries_event_id_equipe_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "adscale_equipe"."equipe_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_notification_deliveries_event_uq" ON "adscale_equipe"."equipe_notification_deliveries" USING btree ("account_id","event_id");--> statement-breakpoint
CREATE INDEX "equipe_notification_deliveries_account_idx" ON "adscale_equipe"."equipe_notification_deliveries" USING btree ("account_id");