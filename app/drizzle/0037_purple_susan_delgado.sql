CREATE TABLE "adscale_app"."creative_performance_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"derivation_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"placement" text NOT NULL,
	"placement_raw" text NOT NULL,
	"ad_account_id" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"source_timezone" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"impressions" numeric(30, 0) NOT NULL,
	"clicks" numeric(30, 0) NOT NULL,
	"spend" numeric(20, 6) NOT NULL,
	"conversions" numeric(20, 6) NOT NULL,
	"conversion_value" numeric(20, 6) NOT NULL,
	"source_type" text NOT NULL,
	"external_campaign_id" text,
	"external_ad_group_id" text,
	"external_ad_id" text,
	"source_key" varchar(64) NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_dimensions" jsonb,
	"source_metadata" jsonb,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creative_performance_period_check" CHECK ("adscale_app"."creative_performance_snapshots"."end_date" >= "adscale_app"."creative_performance_snapshots"."start_date"),
	CONSTRAINT "creative_performance_impressions_nonnegative_check" CHECK ("adscale_app"."creative_performance_snapshots"."impressions" >= 0),
	CONSTRAINT "creative_performance_clicks_nonnegative_check" CHECK ("adscale_app"."creative_performance_snapshots"."clicks" >= 0),
	CONSTRAINT "creative_performance_clicks_lte_impressions_check" CHECK ("adscale_app"."creative_performance_snapshots"."clicks" <= "adscale_app"."creative_performance_snapshots"."impressions"),
	CONSTRAINT "creative_performance_spend_nonnegative_check" CHECK ("adscale_app"."creative_performance_snapshots"."spend" >= 0),
	CONSTRAINT "creative_performance_conversions_nonnegative_check" CHECK ("adscale_app"."creative_performance_snapshots"."conversions" >= 0),
	CONSTRAINT "creative_performance_value_nonnegative_check" CHECK ("adscale_app"."creative_performance_snapshots"."conversion_value" >= 0),
	CONSTRAINT "creative_performance_scope_kind_check" CHECK ("adscale_app"."creative_performance_snapshots"."scope_kind" in ('total', 'segment'))
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_performance_snapshots" ADD CONSTRAINT "creative_performance_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_performance_snapshots" ADD CONSTRAINT "creative_performance_snapshots_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_performance_snapshots" ADD CONSTRAINT "creative_performance_snapshots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_performance_snapshots" ADD CONSTRAINT "creative_performance_snapshots_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_performance_snapshots" ADD CONSTRAINT "creative_performance_snapshots_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_performance_workspace_source_key_uq" ON "adscale_app"."creative_performance_snapshots" USING btree ("workspace_id","source_key");--> statement-breakpoint
CREATE INDEX "creative_performance_workspace_campaign_idx" ON "adscale_app"."creative_performance_snapshots" USING btree ("workspace_id","campaign_id");--> statement-breakpoint
CREATE INDEX "creative_performance_workspace_derivation_idx" ON "adscale_app"."creative_performance_snapshots" USING btree ("workspace_id","derivation_id");--> statement-breakpoint
CREATE INDEX "creative_performance_workspace_client_period_idx" ON "adscale_app"."creative_performance_snapshots" USING btree ("workspace_id","client_profile_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "creative_performance_workspace_placement_idx" ON "adscale_app"."creative_performance_snapshots" USING btree ("workspace_id","platform","placement");
