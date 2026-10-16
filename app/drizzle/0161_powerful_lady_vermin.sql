CREATE TABLE "adscale_app"."semantic_review_collection_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"window_lower" timestamp NOT NULL,
	"window_upper" timestamp NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"consulted" integer NOT NULL,
	"eligible" integer NOT NULL,
	"unique" integer NOT NULL,
	"duplicates" integer NOT NULL,
	"out_of_scope" integer NOT NULL,
	"invalid" integer NOT NULL,
	"not_sampled" integer NOT NULL,
	"exclusions" jsonb NOT NULL,
	"window_complete" boolean NOT NULL,
	"initial_page" boolean NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "semantic_review_collection_runs_status_check" CHECK ("adscale_app"."semantic_review_collection_runs"."status" in ('collected','failed')),
	CONSTRAINT "semantic_review_collection_runs_error_check" CHECK (("adscale_app"."semantic_review_collection_runs"."status" = 'failed' and "adscale_app"."semantic_review_collection_runs"."error_code" is not null and "adscale_app"."semantic_review_collection_runs"."error_code" = 'collection_page_failed') or ("adscale_app"."semantic_review_collection_runs"."status" = 'collected' and "adscale_app"."semantic_review_collection_runs"."error_code" is null)),
	CONSTRAINT "semantic_review_collection_runs_counts_check" CHECK ("adscale_app"."semantic_review_collection_runs"."consulted" >= 0 and "adscale_app"."semantic_review_collection_runs"."eligible" >= 0 and "adscale_app"."semantic_review_collection_runs"."unique" >= 0 and "adscale_app"."semantic_review_collection_runs"."duplicates" >= 0 and "adscale_app"."semantic_review_collection_runs"."out_of_scope" >= 0 and "adscale_app"."semantic_review_collection_runs"."invalid" >= 0 and "adscale_app"."semantic_review_collection_runs"."not_sampled" >= 0 and "adscale_app"."semantic_review_collection_runs"."consulted" = "adscale_app"."semantic_review_collection_runs"."eligible" + "adscale_app"."semantic_review_collection_runs"."out_of_scope" + "adscale_app"."semantic_review_collection_runs"."invalid" and "adscale_app"."semantic_review_collection_runs"."eligible" = "adscale_app"."semantic_review_collection_runs"."unique" + "adscale_app"."semantic_review_collection_runs"."duplicates" + "adscale_app"."semantic_review_collection_runs"."not_sampled")
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD COLUMN "http_elapsed_ms" integer;--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_collection_runs" ADD CONSTRAINT "semantic_review_collection_runs_policy_fk" FOREIGN KEY ("policy_id","workspace_id") REFERENCES "adscale_app"."semantic_review_policies"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "semantic_review_collection_runs_scope_idx" ON "adscale_app"."semantic_review_collection_runs" USING btree ("workspace_id","recorded_at","id");--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD CONSTRAINT "semantic_review_observations_http_elapsed_check" CHECK ("adscale_app"."semantic_review_observations"."http_elapsed_ms" is null or "adscale_app"."semantic_review_observations"."http_elapsed_ms" >= 0);