CREATE TABLE "adscale_app"."credit_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"derivation_id" uuid,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_invites" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_app"."credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."credit_transactions" ADD CONSTRAINT "credit_transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."credit_transactions" ADD CONSTRAINT "credit_transactions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."credit_transactions" ADD CONSTRAINT "credit_transactions_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_transactions_workspace_id_idx" ON "adscale_app"."credit_transactions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_user_id_idx" ON "adscale_app"."credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_campaign_id_idx" ON "adscale_app"."credit_transactions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_created_at_idx" ON "adscale_app"."credit_transactions" USING btree ("created_at");