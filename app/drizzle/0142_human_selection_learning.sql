CREATE TABLE "adscale_app"."creative_work_selection_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence" serial NOT NULL,
	"workspace_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"output_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"choice" jsonb NOT NULL,
	"previous_output_id" uuid,
	"previous_decision_id" uuid,
	"client_profile_id" uuid,
	"campaign_id" uuid,
	"context_snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects" DROP CONSTRAINT IF EXISTS "creative_work_selection_effects_kind_check";--> statement-breakpoint
DROP INDEX IF EXISTS "adscale_app"."creative_work_selection_effects_dedup_uq";--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects" ADD COLUMN "selection_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_work_item_id_creative_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_output_id_creative_work_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_previous_output_id_creative_work_outputs_id_fk" FOREIGN KEY ("previous_output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_previous_decision_id_creative_work_selection_decisions_id_fk" FOREIGN KEY ("previous_decision_id") REFERENCES "adscale_app"."creative_work_selection_decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_decisions" ADD CONSTRAINT "creative_work_selection_decisions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_selection_decisions_request_uq" ON "adscale_app"."creative_work_selection_decisions" USING btree ("workspace_id","request_key");--> statement-breakpoint
CREATE INDEX "creative_work_selection_decisions_work_idx" ON "adscale_app"."creative_work_selection_decisions" USING btree ("workspace_id","work_item_id","sequence");--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects" ADD CONSTRAINT "creative_work_selection_effects_selection_decision_id_creative_work_selection_decisions_id_fk" FOREIGN KEY ("selection_decision_id") REFERENCES "adscale_app"."creative_work_selection_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_selection_effects_learning_uq" ON "adscale_app"."creative_work_selection_effects" USING btree ("workspace_id","selection_decision_id","kind","effect_version") WHERE "adscale_app"."creative_work_selection_effects"."kind" = 'learning';--> statement-breakpoint
CREATE UNIQUE INDEX "creative_work_selection_effects_dedup_uq" ON "adscale_app"."creative_work_selection_effects" USING btree ("workspace_id","output_id","kind","effect_version") WHERE "adscale_app"."creative_work_selection_effects"."kind" <> 'learning';--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects" ADD CONSTRAINT "creative_work_selection_effects_decision_check" CHECK (("adscale_app"."creative_work_selection_effects"."kind" = 'learning') = ("adscale_app"."creative_work_selection_effects"."selection_decision_id" is not null));--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_selection_effects" ADD CONSTRAINT "creative_work_selection_effects_kind_check" CHECK ("adscale_app"."creative_work_selection_effects"."kind" in ('library','value_event','recipe','learning'));