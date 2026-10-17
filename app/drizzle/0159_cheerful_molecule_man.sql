CREATE TABLE "adscale_app"."semantic_review_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"semantic_hash" text NOT NULL,
	"profile" text NOT NULL,
	"input_version" text NOT NULL,
	"rubric_version" text NOT NULL,
	"rubric_hash" text NOT NULL,
	"model" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"observed_updated_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"owner_token" uuid,
	"lease_expires_at" timestamp,
	"send_started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "semantic_review_observations_state_check" CHECK ("adscale_app"."semantic_review_observations"."state" in ('queued','running','completed','failed','skipped','outcome_unknown')),
	CONSTRAINT "semantic_review_observations_hash_check" CHECK ("adscale_app"."semantic_review_observations"."semantic_hash" ~ '^[0-9a-f]{64}$' and "adscale_app"."semantic_review_observations"."rubric_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."semantic_review_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"state" text DEFAULT 'disabled' NOT NULL,
	"provider" text NOT NULL,
	"purpose" text NOT NULL,
	"authorization_reference" text NOT NULL,
	"authorized_by" text NOT NULL,
	"authorized_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"data_origin" text NOT NULL,
	"profile" text NOT NULL,
	"input_version" text NOT NULL,
	"rubric_version" text NOT NULL,
	"rubric_hash" text NOT NULL,
	"model" text NOT NULL,
	"sample_percent" integer DEFAULT 10 NOT NULL,
	"daily_attempt_limit" integer DEFAULT 100 NOT NULL,
	"cursor_updated_at" timestamp,
	"cursor_work_item_id" uuid,
	"window_lower" timestamp,
	"window_upper" timestamp,
	"last_window_upper" timestamp,
	"last_collected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "semantic_review_policies_state_check" CHECK ("adscale_app"."semantic_review_policies"."state" in ('disabled','enabled','revoked')),
	CONSTRAINT "semantic_review_policies_provider_check" CHECK ("adscale_app"."semantic_review_policies"."provider" = 'typesafe' and "adscale_app"."semantic_review_policies"."purpose" = 'prepared_work_semantic_review'),
	CONSTRAINT "semantic_review_policies_window_check" CHECK ("adscale_app"."semantic_review_policies"."expires_at" > "adscale_app"."semantic_review_policies"."authorized_at" and "adscale_app"."semantic_review_policies"."expires_at" <= "adscale_app"."semantic_review_policies"."authorized_at" + interval '14 days'),
	CONSTRAINT "semantic_review_policies_sample_check" CHECK (("adscale_app"."semantic_review_policies"."data_origin" = 'synthetic' and "adscale_app"."semantic_review_policies"."sample_percent" between 0 and 100) or ("adscale_app"."semantic_review_policies"."data_origin" = 'authorized' and "adscale_app"."semantic_review_policies"."sample_percent" = 10)),
	CONSTRAINT "semantic_review_policies_quota_check" CHECK ("adscale_app"."semantic_review_policies"."daily_attempt_limit" between 1 and 100),
	CONSTRAINT "semantic_review_policies_cursor_check" CHECK (("adscale_app"."semantic_review_policies"."cursor_updated_at" is null) = ("adscale_app"."semantic_review_policies"."cursor_work_item_id" is null) and ("adscale_app"."semantic_review_policies"."window_lower" is null) = ("adscale_app"."semantic_review_policies"."window_upper" is null))
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."semantic_review_policy_brands" (
	"policy_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	CONSTRAINT "semantic_review_policy_brands_policy_id_client_profile_id_pk" PRIMARY KEY("policy_id","client_profile_id")
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."semantic_review_quota_days" (
	"workspace_id" uuid NOT NULL,
	"day_utc" date NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "semantic_review_quota_days_workspace_id_day_utc_pk" PRIMARY KEY("workspace_id","day_utc"),
	CONSTRAINT "semantic_review_quota_days_attempts_check" CHECK ("adscale_app"."semantic_review_quota_days"."attempts" between 0 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "semantic_review_observations_identity_uq" ON "adscale_app"."semantic_review_observations" USING btree ("workspace_id","client_profile_id","work_item_id","semantic_hash","input_version","rubric_version","rubric_hash","profile","model");
--> statement-breakpoint
CREATE UNIQUE INDEX "semantic_review_policies_id_workspace_uq" ON "adscale_app"."semantic_review_policies" USING btree ("id","workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "semantic_review_policies_enabled_workspace_uq" ON "adscale_app"."semantic_review_policies" USING btree ("workspace_id") WHERE "adscale_app"."semantic_review_policies"."state" = 'enabled';
--> statement-breakpoint
CREATE UNIQUE INDEX "client_profiles_id_workspace_uq" ON "adscale_app"."client_profiles" USING btree ("id","workspace_id");
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD CONSTRAINT "semantic_review_observations_policy_fk" FOREIGN KEY ("policy_id","workspace_id") REFERENCES "adscale_app"."semantic_review_policies"("id","workspace_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD CONSTRAINT "semantic_review_observations_work_fk" FOREIGN KEY ("work_item_id","workspace_id") REFERENCES "adscale_app"."creative_work_items"("id","workspace_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD CONSTRAINT "semantic_review_observations_brand_fk" FOREIGN KEY ("client_profile_id","workspace_id") REFERENCES "adscale_app"."client_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_observations" ADD CONSTRAINT "semantic_review_observations_policy_brand_fk" FOREIGN KEY ("policy_id","client_profile_id") REFERENCES "adscale_app"."semantic_review_policy_brands"("policy_id","client_profile_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_policies" ADD CONSTRAINT "semantic_review_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_policy_brands" ADD CONSTRAINT "semantic_review_policy_brands_policy_fk" FOREIGN KEY ("policy_id","workspace_id") REFERENCES "adscale_app"."semantic_review_policies"("id","workspace_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_policy_brands" ADD CONSTRAINT "semantic_review_policy_brands_brand_fk" FOREIGN KEY ("client_profile_id","workspace_id") REFERENCES "adscale_app"."client_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."semantic_review_quota_days" ADD CONSTRAINT "semantic_review_quota_days_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
