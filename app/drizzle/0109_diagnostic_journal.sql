CREATE TABLE IF NOT EXISTS "adscale_app"."diagnostic_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "client_profile_id" text,
  "work_item_id" text NOT NULL,
  "protocol" text NOT NULL DEFAULT 'single',
  "operation_id" text NOT NULL,
  "parent_operation_id" text,
  "generation_correlation_id" text,
  "output_id" text,
  "attempt_number" integer,
  "event" text NOT NULL,
  "stage" text,
  "status" text,
  "correlation" text NOT NULL DEFAULT 'full',
  "occurred_at" timestamp NOT NULL,
  "recorded_at" timestamp NOT NULL,
  "duration_ms" integer,
  "call_id" text,
  "provider" text,
  "requested_model" text,
  "returned_model" text,
  "provider_request_id" text,
  "latency_ms" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "error_class" text,
  "error_status" integer,
  "error_reason" text,
  "sentry_event_id" text,
  "inngest_run_id" text,
  "langfuse_trace_id" text,
  "langfuse_observation_id" text,
  "content_availability" text,
  "content_policy_version" text,
  "release_sha" text NOT NULL,
  "environment" text NOT NULL,
  "process" text NOT NULL,
  "data_origin" text NOT NULL,
  "export_state" text NOT NULL DEFAULT 'created',
  "attributes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "schema_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."diagnostic_events"
  ADD CONSTRAINT "diagnostic_events_event_check"
  CHECK ("event" in ('operation.started','stage.started','stage.completed','stage.failed','model.call.started','model.call.completed','model.call.failed','model.validation.failed','operation.replayed','operation.completed','operation.failed','selection.confirmed','selection.effect.failed','export.prepared','export.served','telemetry.degraded'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."diagnostic_events"
  ADD CONSTRAINT "diagnostic_events_correlation_check"
  CHECK ("correlation" in ('full','partial'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."diagnostic_events"
  ADD CONSTRAINT "diagnostic_events_process_check"
  CHECK ("process" in ('web','worker'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."diagnostic_events"
  ADD CONSTRAINT "diagnostic_events_data_origin_check"
  CHECK ("data_origin" in ('production','staging','synthetic','test'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."diagnostic_events"
  ADD CONSTRAINT "diagnostic_events_export_state_check"
  CHECK ("export_state" in ('created','export_pending','observed_at_destination','unavailable'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_events_workspace_work_time_idx"
  ON "adscale_app"."diagnostic_events" ("workspace_id", "work_item_id", "occurred_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_events_environment_time_idx"
  ON "adscale_app"."diagnostic_events" ("environment", "occurred_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_events_workspace_call_idx"
  ON "adscale_app"."diagnostic_events" ("workspace_id", "call_id") WHERE "call_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."diagnostic_access_audit" (
  "id" uuid PRIMARY KEY NOT NULL,
  "operator_id" text NOT NULL,
  "scope" text NOT NULL,
  "workspace_id" text NOT NULL,
  "work_item_id" text NOT NULL,
  "resource" text NOT NULL,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "result" text NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."diagnostic_access_audit"
  ADD CONSTRAINT "diagnostic_access_audit_result_check"
  CHECK ("result" in ('allowed','denied'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_access_audit_workspace_work_time_idx"
  ON "adscale_app"."diagnostic_access_audit" ("workspace_id", "work_item_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_access_audit_operator_time_idx"
  ON "adscale_app"."diagnostic_access_audit" ("operator_id", "occurred_at");
