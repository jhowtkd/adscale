CREATE TABLE IF NOT EXISTS "adscale_app"."served_ad_snapshots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL,
  "window_days" integer NOT NULL,
  "period_start" timestamp NOT NULL,
  "period_end" timestamp NOT NULL,
  "currency" text NOT NULL,
  "attribution" jsonb NOT NULL,
  "completeness" text NOT NULL,
  "origin" text NOT NULL,
  "definition_version" integer NOT NULL DEFAULT 2,
  "collected_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_snapshots"
  ADD CONSTRAINT "served_ad_snapshots_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "adscale_app"."meta_ad_accounts"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "served_ad_snapshots_account_window_idx"
  ON "adscale_app"."served_ad_snapshots" ("account_id", "window_days");
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_metrics" ADD COLUMN IF NOT EXISTS "action_counts" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_metrics" ADD COLUMN IF NOT EXISTS "ambiguous_action_types" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_metrics" ADD COLUMN IF NOT EXISTS "definition_version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_metrics" ADD COLUMN IF NOT EXISTS "snapshot_id" uuid;
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_metrics"
  ADD CONSTRAINT "served_ad_metrics_snapshot_id_fk"
  FOREIGN KEY ("snapshot_id") REFERENCES "adscale_app"."served_ad_snapshots"("id") ON DELETE set null;
