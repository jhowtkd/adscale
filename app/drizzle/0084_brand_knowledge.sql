CREATE TABLE IF NOT EXISTS "adscale_app"."brand_knowledge_claims" (
  "id" uuid PRIMARY KEY,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "claim_key" text NOT NULL,
  "kind" text NOT NULL,
  "value" jsonb NOT NULL,
  "scope" jsonb NOT NULL,
  "authority" text NOT NULL,
  "confidence" text NOT NULL,
  "status" text NOT NULL DEFAULT 'candidate',
  "evidence_refs" jsonb NOT NULL,
  "extractor_version" text NOT NULL,
  "source_hash" text NOT NULL,
  "review_decision" jsonb,
  "reviewed_at" timestamp,
  "reviewed_by_user_id" text REFERENCES "adscale_app"."user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "brand_knowledge_claims_status_check" CHECK ("status" IN ('candidate','approved','rejected','superseded'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "brand_knowledge_claims_source_uq" ON "adscale_app"."brand_knowledge_claims" ("workspace_id", "client_profile_id", "claim_key", "source_hash");
CREATE INDEX IF NOT EXISTS "brand_knowledge_claims_scope_idx" ON "adscale_app"."brand_knowledge_claims" ("workspace_id", "client_profile_id", "status");

CREATE TABLE IF NOT EXISTS "adscale_app"."brand_knowledge_versions" (
  "id" uuid PRIMARY KEY,
  "workspace_id" uuid NOT NULL REFERENCES "adscale_app"."workspaces"("id") ON DELETE CASCADE,
  "client_profile_id" uuid NOT NULL REFERENCES "adscale_app"."client_profiles"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "snapshot" jsonb NOT NULL,
  "published_by_user_id" text NOT NULL REFERENCES "adscale_app"."user"("id") ON DELETE RESTRICT,
  "published_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "brand_knowledge_versions_status_check" CHECK ("status" IN ('active','superseded'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "brand_knowledge_versions_number_uq" ON "adscale_app"."brand_knowledge_versions" ("workspace_id", "client_profile_id", "version_number");
CREATE UNIQUE INDEX IF NOT EXISTS "brand_knowledge_versions_hash_uq" ON "adscale_app"."brand_knowledge_versions" ("workspace_id", "client_profile_id", "hash");
CREATE UNIQUE INDEX IF NOT EXISTS "brand_knowledge_versions_active_uq" ON "adscale_app"."brand_knowledge_versions" ("workspace_id", "client_profile_id") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "brand_knowledge_versions_history_idx" ON "adscale_app"."brand_knowledge_versions" ("workspace_id", "client_profile_id", "published_at");
