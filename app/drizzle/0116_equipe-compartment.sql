CREATE SCHEMA IF NOT EXISTS "adscale_equipe";
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_account_people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" text,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_account_people_role_check" CHECK ("adscale_equipe"."equipe_account_people"."role" in ('approver', 'substitute', 'custodian', 'member'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"status" text DEFAULT 'deploying' NOT NULL,
	"launched_at" timestamp,
	"closed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_accounts_status_check" CHECK ("adscale_equipe"."equipe_accounts"."status" in ('deploying', 'paused', 'calibrating', 'active', 'suspended', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"front_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"approve_by_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_batches_status_check" CHECK ("adscale_equipe"."equipe_batches"."status" in ('open', 'delivered', 'approved', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_calibration_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"front_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp,
	"decision" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_calibration_rounds_status_check" CHECK ("adscale_equipe"."equipe_calibration_rounds"."status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_calibration_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"version_hash" text NOT NULL,
	"rubric" jsonb,
	"verdict" text NOT NULL,
	"feedback" text,
	"relaxed" boolean DEFAULT false NOT NULL,
	"evidence" jsonb,
	"scored_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_calibration_scores_verdict_check" CHECK ("adscale_equipe"."equipe_calibration_scores"."verdict" in ('pass', 'fail', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text DEFAULT 'instagram' NOT NULL,
	"encrypted_token" text NOT NULL,
	"custodian_person_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_connections_status_check" CHECK ("adscale_equipe"."equipe_connections"."status" in ('active', 'expired', 'revoked', 'error'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_context_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"section" text NOT NULL,
	"version" integer NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_role" text,
	"author_id" text,
	"receipt_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_context_versions_status_check" CHECK ("adscale_equipe"."equipe_context_versions"."status" in ('draft', 'proposed', 'approved', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_escalations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"front_id" uuid,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"owner_role" text NOT NULL,
	"co_owner_role" text,
	"due_at" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"cause" text,
	"lesson_candidate" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_escalations_severity_check" CHECK ("adscale_equipe"."equipe_escalations"."severity" in ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "equipe_escalations_status_check" CHECK ("adscale_equipe"."equipe_escalations"."status" in ('open', 'acknowledged', 'resolving', 'resolved', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"event_type" text NOT NULL,
	"object_type" text,
	"object_id" uuid,
	"payload" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_events_actor_type_check" CHECK ("adscale_equipe"."equipe_events"."actor_type" in ('client_person', 'staff', 'agent', 'system'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_exceptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp,
	"owner_role" text DEFAULT 'account_manager' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_exceptions_status_check" CHECK ("adscale_equipe"."equipe_exceptions"."status" in ('open', 'claimed', 'resolved', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_fronts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"calibration_sequence" integer DEFAULT 0 NOT NULL,
	"rounds_used" integer DEFAULT 0 NOT NULL,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_fronts_key_check" CHECK ("adscale_equipe"."equipe_fronts"."key" in ('social_instagram', 'midia_paga')),
	CONSTRAINT "equipe_fronts_status_check" CHECK ("adscale_equipe"."equipe_fronts"."status" in ('draft', 'calibrating', 'released', 'paused', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_ideas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resulting_plan_version" integer,
	"resulting_mandate_version" integer,
	"decided_at" timestamp,
	"receipt_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_ideas_kind_check" CHECK ("adscale_equipe"."equipe_ideas"."kind" in ('plan_change', 'mandate_change', 'content')),
	CONSTRAINT "equipe_ideas_status_check" CHECK ("adscale_equipe"."equipe_ideas"."status" in ('proposed', 'accepted', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_item_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"version_hash" text NOT NULL,
	"creative_work_output_id" uuid,
	"caption" text DEFAULT '' NOT NULL,
	"scheduled_for" timestamp,
	"author_role" text NOT NULL,
	"author_id" text,
	"reviewer_findings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"front_id" uuid NOT NULL,
	"batch_id" uuid,
	"creative_work_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp,
	"deadline_at" timestamp,
	"current_version_hash" text,
	"published_output_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_items_status_check" CHECK ("adscale_equipe"."equipe_items"."status" in ('draft', 'in_production', 'in_review', 'pending_approval', 'approved', 'scheduled', 'held', 'verifying', 'published', 'missed_window', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_mandates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"front_id" uuid,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"shadow" boolean DEFAULT false NOT NULL,
	"limits" jsonb,
	"window" jsonb,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"stop_condition" jsonb,
	"receipt_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_mandates_status_check" CHECK ("adscale_equipe"."equipe_mandates"."status" in ('draft', 'proposed', 'approved', 'suspended', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_onboarding_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"owner" text,
	"due_at" timestamp,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"reminders_cap" integer DEFAULT 3 NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_onboarding_steps_step_check" CHECK ("adscale_equipe"."equipe_onboarding_steps"."step" in ('scope_confirm', 'materials', 'context', 'plan', 'mandate', 'connection', 'go_live')),
	CONSTRAINT "equipe_onboarding_steps_status_check" CHECK ("adscale_equipe"."equipe_onboarding_steps"."status" in ('pending', 'in_progress', 'done', 'skipped', 'paused'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_pauses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"front_id" uuid,
	"level" text NOT NULL,
	"scope" text NOT NULL,
	"origin" text NOT NULL,
	"resumable_by" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"lifted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_pauses_level_check" CHECK ("adscale_equipe"."equipe_pauses"."level" in ('publishing', 'execution', 'billing')),
	CONSTRAINT "equipe_pauses_scope_check" CHECK ("adscale_equipe"."equipe_pauses"."scope" in ('account', 'front', 'global')),
	CONSTRAINT "equipe_pauses_status_check" CHECK ("adscale_equipe"."equipe_pauses"."status" in ('active', 'lifted'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"receipt_id" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_plans_status_check" CHECK ("adscale_equipe"."equipe_plans"."status" in ('draft', 'proposed', 'approved', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_publication_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"version_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"external_id" text,
	"container_id" text,
	"last_error" text,
	"scheduled_for" timestamp NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_publication_intents_status_check" CHECK ("adscale_equipe"."equipe_publication_intents"."status" in ('pending', 'sending', 'verifying', 'published', 'failed', 'held', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"person_kind" text NOT NULL,
	"person_id" text,
	"person_role" text,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"object_version" text,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_receipts_person_kind_check" CHECK ("adscale_equipe"."equipe_receipts"."person_kind" in ('client_person', 'staff', 'agent', 'system'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"role" text NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_staff_role_check" CHECK ("adscale_equipe"."equipe_staff"."role" in ('account_manager', 'quality', 'operations'))
);
--> statement-breakpoint
CREATE TABLE "adscale_equipe"."equipe_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text DEFAULT 'primary' NOT NULL,
	"topic" text,
	"assistant_thread_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_threads_kind_check" CHECK ("adscale_equipe"."equipe_threads"."kind" in ('primary', 'parallel'))
);
--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_account_people" ADD CONSTRAINT "equipe_account_people_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_account_people" ADD CONSTRAINT "equipe_account_people_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_account_people" ADD CONSTRAINT "equipe_account_people_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_accounts" ADD CONSTRAINT "equipe_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_accounts" ADD CONSTRAINT "equipe_accounts_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_batches" ADD CONSTRAINT "equipe_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_batches" ADD CONSTRAINT "equipe_batches_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_batches" ADD CONSTRAINT "equipe_batches_front_id_equipe_fronts_id_fk" FOREIGN KEY ("front_id") REFERENCES "adscale_equipe"."equipe_fronts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_rounds" ADD CONSTRAINT "equipe_calibration_rounds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_rounds" ADD CONSTRAINT "equipe_calibration_rounds_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_rounds" ADD CONSTRAINT "equipe_calibration_rounds_front_id_equipe_fronts_id_fk" FOREIGN KEY ("front_id") REFERENCES "adscale_equipe"."equipe_fronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_scores" ADD CONSTRAINT "equipe_calibration_scores_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_scores" ADD CONSTRAINT "equipe_calibration_scores_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_scores" ADD CONSTRAINT "equipe_calibration_scores_round_id_equipe_calibration_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "adscale_equipe"."equipe_calibration_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_calibration_scores" ADD CONSTRAINT "equipe_calibration_scores_item_id_equipe_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "adscale_equipe"."equipe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_connections" ADD CONSTRAINT "equipe_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_connections" ADD CONSTRAINT "equipe_connections_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_connections" ADD CONSTRAINT "equipe_connections_custodian_person_id_equipe_account_people_id_fk" FOREIGN KEY ("custodian_person_id") REFERENCES "adscale_equipe"."equipe_account_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_context_versions" ADD CONSTRAINT "equipe_context_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_context_versions" ADD CONSTRAINT "equipe_context_versions_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_context_versions" ADD CONSTRAINT "equipe_context_versions_receipt_id_equipe_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "adscale_equipe"."equipe_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD CONSTRAINT "equipe_escalations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD CONSTRAINT "equipe_escalations_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_escalations" ADD CONSTRAINT "equipe_escalations_front_id_equipe_fronts_id_fk" FOREIGN KEY ("front_id") REFERENCES "adscale_equipe"."equipe_fronts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_events" ADD CONSTRAINT "equipe_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_events" ADD CONSTRAINT "equipe_events_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_exceptions" ADD CONSTRAINT "equipe_exceptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_exceptions" ADD CONSTRAINT "equipe_exceptions_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_fronts" ADD CONSTRAINT "equipe_fronts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_fronts" ADD CONSTRAINT "equipe_fronts_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_ideas" ADD CONSTRAINT "equipe_ideas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_ideas" ADD CONSTRAINT "equipe_ideas_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_ideas" ADD CONSTRAINT "equipe_ideas_receipt_id_equipe_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "adscale_equipe"."equipe_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_item_versions" ADD CONSTRAINT "equipe_item_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_item_versions" ADD CONSTRAINT "equipe_item_versions_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_item_versions" ADD CONSTRAINT "equipe_item_versions_item_id_equipe_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "adscale_equipe"."equipe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_item_versions" ADD CONSTRAINT "equipe_item_versions_creative_work_output_id_creative_work_outputs_id_fk" FOREIGN KEY ("creative_work_output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD CONSTRAINT "equipe_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD CONSTRAINT "equipe_items_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD CONSTRAINT "equipe_items_front_id_equipe_fronts_id_fk" FOREIGN KEY ("front_id") REFERENCES "adscale_equipe"."equipe_fronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD CONSTRAINT "equipe_items_batch_id_equipe_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "adscale_equipe"."equipe_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD CONSTRAINT "equipe_items_creative_work_id_creative_work_items_id_fk" FOREIGN KEY ("creative_work_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_items" ADD CONSTRAINT "equipe_items_published_output_id_creative_work_outputs_id_fk" FOREIGN KEY ("published_output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_mandates" ADD CONSTRAINT "equipe_mandates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_mandates" ADD CONSTRAINT "equipe_mandates_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_mandates" ADD CONSTRAINT "equipe_mandates_front_id_equipe_fronts_id_fk" FOREIGN KEY ("front_id") REFERENCES "adscale_equipe"."equipe_fronts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_mandates" ADD CONSTRAINT "equipe_mandates_receipt_id_equipe_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "adscale_equipe"."equipe_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_onboarding_steps" ADD CONSTRAINT "equipe_onboarding_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_onboarding_steps" ADD CONSTRAINT "equipe_onboarding_steps_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_pauses" ADD CONSTRAINT "equipe_pauses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_pauses" ADD CONSTRAINT "equipe_pauses_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_pauses" ADD CONSTRAINT "equipe_pauses_front_id_equipe_fronts_id_fk" FOREIGN KEY ("front_id") REFERENCES "adscale_equipe"."equipe_fronts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_plans" ADD CONSTRAINT "equipe_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_plans" ADD CONSTRAINT "equipe_plans_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_plans" ADD CONSTRAINT "equipe_plans_receipt_id_equipe_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "adscale_equipe"."equipe_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_publication_intents" ADD CONSTRAINT "equipe_publication_intents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_publication_intents" ADD CONSTRAINT "equipe_publication_intents_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_publication_intents" ADD CONSTRAINT "equipe_publication_intents_item_id_equipe_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "adscale_equipe"."equipe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_receipts" ADD CONSTRAINT "equipe_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_receipts" ADD CONSTRAINT "equipe_receipts_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_staff" ADD CONSTRAINT "equipe_staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_threads" ADD CONSTRAINT "equipe_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_threads" ADD CONSTRAINT "equipe_threads_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_threads" ADD CONSTRAINT "equipe_threads_assistant_thread_id_assistant_threads_id_fk" FOREIGN KEY ("assistant_thread_id") REFERENCES "adscale_app"."assistant_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipe_account_people_account_idx" ON "adscale_equipe"."equipe_account_people" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_accounts_workspace_profile_uq" ON "adscale_equipe"."equipe_accounts" USING btree ("workspace_id","client_profile_id");--> statement-breakpoint
CREATE INDEX "equipe_accounts_workspace_idx" ON "adscale_equipe"."equipe_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "equipe_batches_account_idx" ON "adscale_equipe"."equipe_batches" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_calibration_rounds_front_sequence_uq" ON "adscale_equipe"."equipe_calibration_rounds" USING btree ("front_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_calibration_scores_round_item_hash_uq" ON "adscale_equipe"."equipe_calibration_scores" USING btree ("round_id","item_id","version_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_connections_account_provider_uq" ON "adscale_equipe"."equipe_connections" USING btree ("account_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_context_versions_account_section_version_uq" ON "adscale_equipe"."equipe_context_versions" USING btree ("account_id","section","version");--> statement-breakpoint
CREATE INDEX "equipe_escalations_account_idx" ON "adscale_equipe"."equipe_escalations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "equipe_events_account_occurred_idx" ON "adscale_equipe"."equipe_events" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "equipe_exceptions_account_idx" ON "adscale_equipe"."equipe_exceptions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_fronts_account_key_uq" ON "adscale_equipe"."equipe_fronts" USING btree ("account_id","key");--> statement-breakpoint
CREATE INDEX "equipe_ideas_account_idx" ON "adscale_equipe"."equipe_ideas" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_item_versions_item_hash_uq" ON "adscale_equipe"."equipe_item_versions" USING btree ("item_id","version_hash");--> statement-breakpoint
CREATE INDEX "equipe_item_versions_account_idx" ON "adscale_equipe"."equipe_item_versions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "equipe_items_account_idx" ON "adscale_equipe"."equipe_items" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "equipe_items_batch_idx" ON "adscale_equipe"."equipe_items" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_mandates_account_version_uq" ON "adscale_equipe"."equipe_mandates" USING btree ("account_id","version");--> statement-breakpoint
CREATE INDEX "equipe_mandates_account_idx" ON "adscale_equipe"."equipe_mandates" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_onboarding_steps_account_step_uq" ON "adscale_equipe"."equipe_onboarding_steps" USING btree ("account_id","step");--> statement-breakpoint
CREATE INDEX "equipe_pauses_account_idx" ON "adscale_equipe"."equipe_pauses" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_plans_account_version_uq" ON "adscale_equipe"."equipe_plans" USING btree ("account_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_publication_intents_item_hash_uq" ON "adscale_equipe"."equipe_publication_intents" USING btree ("item_id","version_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_publication_intents_key_uq" ON "adscale_equipe"."equipe_publication_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "equipe_publication_intents_claim_idx" ON "adscale_equipe"."equipe_publication_intents" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "equipe_publication_intents_account_idx" ON "adscale_equipe"."equipe_publication_intents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "equipe_receipts_account_object_idx" ON "adscale_equipe"."equipe_receipts" USING btree ("account_id","object_type","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_staff_user_role_uq" ON "adscale_equipe"."equipe_staff" USING btree ("user_id","role") WHERE "adscale_equipe"."equipe_staff"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_threads_account_primary_uq" ON "adscale_equipe"."equipe_threads" USING btree ("account_id") WHERE "adscale_equipe"."equipe_threads"."kind" = 'primary';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "adscale_equipe"."reject_immutable_equipe_row"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Válvula de escape explícita por transação (limpeza de testes e remoção do
  -- piloto via migração): sem ela, nem o CASCADE de workspace/account conclui.
  -- O app nunca liga; o padrão é rejeitar.
  IF current_setting('equipe.allow_immutable_write', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'equipe_immutable: % rejeita %', TG_TABLE_NAME, TG_OP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "equipe_item_versions_no_update" ON "adscale_equipe"."equipe_item_versions";
--> statement-breakpoint
CREATE TRIGGER "equipe_item_versions_no_update" BEFORE UPDATE ON "adscale_equipe"."equipe_item_versions" FOR EACH ROW EXECUTE FUNCTION "adscale_equipe"."reject_immutable_equipe_row"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "equipe_item_versions_no_delete" ON "adscale_equipe"."equipe_item_versions";
--> statement-breakpoint
CREATE TRIGGER "equipe_item_versions_no_delete" BEFORE DELETE ON "adscale_equipe"."equipe_item_versions" FOR EACH ROW EXECUTE FUNCTION "adscale_equipe"."reject_immutable_equipe_row"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "equipe_receipts_no_update" ON "adscale_equipe"."equipe_receipts";
--> statement-breakpoint
CREATE TRIGGER "equipe_receipts_no_update" BEFORE UPDATE ON "adscale_equipe"."equipe_receipts" FOR EACH ROW EXECUTE FUNCTION "adscale_equipe"."reject_immutable_equipe_row"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "equipe_receipts_no_delete" ON "adscale_equipe"."equipe_receipts";
--> statement-breakpoint
CREATE TRIGGER "equipe_receipts_no_delete" BEFORE DELETE ON "adscale_equipe"."equipe_receipts" FOR EACH ROW EXECUTE FUNCTION "adscale_equipe"."reject_immutable_equipe_row"();
