CREATE TABLE IF NOT EXISTS "adscale_app"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"derivation_id" uuid,
	"campaign_id" uuid,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."notifications" ADD CONSTRAINT "notifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "adscale_app"."notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_workspace_id_idx" ON "adscale_app"."notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_read_at_idx" ON "adscale_app"."notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "adscale_app"."notifications" USING btree ("created_at");
