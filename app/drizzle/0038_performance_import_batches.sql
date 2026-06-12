CREATE TABLE "adscale_app"."performance_import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"file_name" text,
	"file_hash" text,
	"column_mapping" jsonb,
	"parse_options" jsonb,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"ignored_count" integer DEFAULT 0 NOT NULL,
	"invalid_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "performance_import_batches_source_type_check" CHECK ("adscale_app"."performance_import_batches"."source_type" in ('manual', 'csv'))
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."performance_import_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"status" text NOT NULL,
	"errors" jsonb,
	"snapshot_id" uuid,
	"source_key" varchar(64),
	CONSTRAINT "performance_import_rows_status_check" CHECK ("adscale_app"."performance_import_rows"."status" in ('created', 'updated', 'ignored', 'invalid'))
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."performance_import_batches" ADD CONSTRAINT "performance_import_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."performance_import_batches" ADD CONSTRAINT "performance_import_batches_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."performance_import_batches" ADD CONSTRAINT "performance_import_batches_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."performance_import_rows" ADD CONSTRAINT "performance_import_rows_batch_id_performance_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "adscale_app"."performance_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."performance_import_rows" ADD CONSTRAINT "performance_import_rows_snapshot_id_creative_performance_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "adscale_app"."creative_performance_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performance_import_batches_workspace_campaign_idx" ON "adscale_app"."performance_import_batches" USING btree ("workspace_id","campaign_id");--> statement-breakpoint
CREATE INDEX "performance_import_rows_batch_idx" ON "adscale_app"."performance_import_rows" USING btree ("batch_id");
