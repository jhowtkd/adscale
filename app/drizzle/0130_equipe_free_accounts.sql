CREATE TABLE "adscale_equipe"."equipe_brand_handoffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"step" text DEFAULT 'source' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_task_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"data" jsonb NOT NULL,
	"dispatched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_accounts" DROP CONSTRAINT "equipe_accounts_status_check";--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_agent_ledger" ADD COLUMN "reserved_cost_usd_cents" integer;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_agent_ledger" ADD COLUMN "reservation_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_agent_ledger" ADD COLUMN "settled_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD CONSTRAINT "equipe_brand_handoffs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD CONSTRAINT "equipe_brand_handoffs_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD CONSTRAINT "equipe_brand_handoffs_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_task_outbox" ADD CONSTRAINT "equipe_task_outbox_id_equipe_events_id_fk" FOREIGN KEY ("id") REFERENCES "adscale_equipe"."equipe_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_task_outbox" ADD CONSTRAINT "equipe_task_outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_task_outbox" ADD CONSTRAINT "equipe_task_outbox_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_brand_handoffs_account_uq" ON "adscale_equipe"."equipe_brand_handoffs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "equipe_task_outbox_pending_idx" ON "adscale_equipe"."equipe_task_outbox" USING btree ("created_at") WHERE "adscale_equipe"."equipe_task_outbox"."dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "equipe_agent_ledger_reservations_idx" ON "adscale_equipe"."equipe_agent_ledger" USING btree ("reservation_expires_at") WHERE "adscale_equipe"."equipe_agent_ledger"."settled_at" is null and "adscale_equipe"."equipe_agent_ledger"."reserved_cost_usd_cents" is not null;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_accounts" ADD CONSTRAINT "equipe_accounts_status_check" CHECK ("adscale_equipe"."equipe_accounts"."status" in ('free', 'deploying', 'paused', 'calibrating', 'active', 'suspended', 'closed'));