CREATE TABLE "adscale_app"."client_corpus_consent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"reviewed_by_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"granted_at" timestamp,
	"revoked_at" timestamp,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_corpus_consent_events_kind_check" CHECK ("adscale_app"."client_corpus_consent_events"."kind" in ('grant','revoke','initial_observation')),
	CONSTRAINT "client_corpus_consent_events_status_check" CHECK ("adscale_app"."client_corpus_consent_events"."status" in ('granted','revoked'))
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consents" DROP CONSTRAINT IF EXISTS "client_corpus_consents_reviewed_by_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consents" DROP CONSTRAINT IF EXISTS "client_corpus_consents_reviewed_by_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consents" ADD COLUMN "current_event_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_app"."human_quality_corpus_items" ADD COLUMN "consent_event_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consent_events" ADD CONSTRAINT "client_corpus_consent_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consent_events" ADD CONSTRAINT "client_corpus_consent_events_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consent_events" ADD CONSTRAINT "client_corpus_consent_events_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_corpus_consent_events_idempotency_uq" ON "adscale_app"."client_corpus_consent_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "client_corpus_consent_events_scope_idx" ON "adscale_app"."client_corpus_consent_events" USING btree ("workspace_id","client_profile_id","occurred_at");--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consents" ADD CONSTRAINT "client_corpus_consents_current_event_id_client_corpus_consent_events_id_fk" FOREIGN KEY ("current_event_id") REFERENCES "adscale_app"."client_corpus_consent_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_corpus_consents" ADD CONSTRAINT "client_corpus_consents_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."human_quality_corpus_items" ADD CONSTRAINT "human_quality_corpus_items_consent_event_id_client_corpus_consent_events_id_fk" FOREIGN KEY ("consent_event_id") REFERENCES "adscale_app"."client_corpus_consent_events"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Observe only the state and author already recorded; historical ingress stays unlinked.
INSERT INTO "adscale_app"."client_corpus_consent_events"
  ("id", "workspace_id", "client_profile_id", "reviewed_by_user_id", "kind", "status", "idempotency_key", "granted_at", "revoked_at", "occurred_at")
SELECT gen_random_uuid(), "workspace_id", "client_profile_id", "reviewed_by_user_id", 'initial_observation', "status",
  'migration:corpus-consent:' || "client_profile_id"::text, "granted_at", "revoked_at", "updated_at"
FROM "adscale_app"."client_corpus_consents"
WHERE "current_event_id" IS NULL
ON CONFLICT ("idempotency_key") DO NOTHING;
--> statement-breakpoint
UPDATE "adscale_app"."client_corpus_consents" AS consent
SET "current_event_id" = event."id"
FROM "adscale_app"."client_corpus_consent_events" AS event
WHERE consent."current_event_id" IS NULL
  AND event."idempotency_key" = 'migration:corpus-consent:' || consent."client_profile_id"::text
  AND event."workspace_id" = consent."workspace_id"
  AND event."client_profile_id" = consent."client_profile_id"
  AND event."kind" = 'initial_observation';
