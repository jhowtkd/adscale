CREATE TABLE "adscale_equipe"."equipe_agent_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"task_kind" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_agent_ledger_role_check" CHECK ("adscale_equipe"."equipe_agent_ledger"."role" in ('strategist', 'research', 'writer', 'reviewer_text', 'reviewer_visual', 'measurement'))
);
--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_agent_ledger" ADD CONSTRAINT "equipe_agent_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_agent_ledger" ADD CONSTRAINT "equipe_agent_ledger_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipe_agent_ledger_account_idx" ON "adscale_equipe"."equipe_agent_ledger" USING btree ("account_id");