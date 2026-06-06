-- feedback_reports existed in Drizzle snapshots/journal (0026) but may be absent in production.
CREATE TABLE IF NOT EXISTS "adscale_app"."feedback_reports" (
	"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"follow_up_allowed" boolean DEFAULT false NOT NULL,
	"route" text,
	"context_kind" text DEFAULT 'global' NOT NULL,
	"campaign_id" uuid,
	"derivation_id" uuid,
	"asset_refs" jsonb,
	"diagnostic_context" jsonb,
	"sentry_correlation" jsonb,
	"context_completeness" jsonb,
	"internal_notes" text,
	"resolution_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "adscale_app"."feedback_reports" ADD CONSTRAINT "feedback_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_user_id_user_id_fk') THEN
    ALTER TABLE "adscale_app"."feedback_reports" ADD CONSTRAINT "feedback_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_campaign_id_campaigns_id_fk') THEN
    ALTER TABLE "adscale_app"."feedback_reports" ADD CONSTRAINT "feedback_reports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_derivation_id_derivations_id_fk') THEN
    ALTER TABLE "adscale_app"."feedback_reports" ADD CONSTRAINT "feedback_reports_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_reports_workspace_id_idx" ON "adscale_app"."feedback_reports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_reports_user_id_idx" ON "adscale_app"."feedback_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_reports_status_idx" ON "adscale_app"."feedback_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_reports_created_at_idx" ON "adscale_app"."feedback_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_reports_campaign_id_idx" ON "adscale_app"."feedback_reports" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_reports_derivation_id_idx" ON "adscale_app"."feedback_reports" USING btree ("derivation_id");
