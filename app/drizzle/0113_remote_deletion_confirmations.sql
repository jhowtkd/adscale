CREATE TABLE "adscale_app"."diagnostic_remote_deletion_confirmations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"workspace_id" text,
	"delete_accepted" boolean NOT NULL,
	"requery_found" boolean,
	"confirmed" boolean NOT NULL,
	"confirmed_at" timestamp,
	"error" text,
	"run_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "diagnostic_remote_deletion_trace_run_idx" ON "adscale_app"."diagnostic_remote_deletion_confirmations" USING btree ("trace_id","run_at");