CREATE TABLE IF NOT EXISTS "adscale_app"."client_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "visual_notes" text,
  "tone_notes" text,
  "constraints" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "adscale_app"."client_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "asset_key" text NOT NULL,
  "label" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'other',
  "notes" text,
  "source_derivation_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "adscale_app"."campaigns"
  ADD COLUMN IF NOT EXISTS "client_profile_id" uuid,
  ADD COLUMN IF NOT EXISTS "selected_reference_ids" text[];

DO $$ BEGIN
  ALTER TABLE "adscale_app"."client_profiles"
    ADD CONSTRAINT "client_profiles_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id")
    ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "adscale_app"."client_references"
    ADD CONSTRAINT "client_references_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id")
    ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "adscale_app"."client_references"
    ADD CONSTRAINT "client_references_client_profile_id_client_profiles_id_fk"
    FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id")
    ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "adscale_app"."client_references"
    ADD CONSTRAINT "client_references_source_derivation_id_derivations_id_fk"
    FOREIGN KEY ("source_derivation_id") REFERENCES "adscale_app"."derivations"("id")
    ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "adscale_app"."campaigns"
    ADD CONSTRAINT "campaigns_client_profile_id_client_profiles_id_fk"
    FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id")
    ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "client_profiles_workspace_id_idx"
  ON "adscale_app"."client_profiles" ("workspace_id");

CREATE INDEX IF NOT EXISTS "client_references_workspace_id_idx"
  ON "adscale_app"."client_references" ("workspace_id");

CREATE INDEX IF NOT EXISTS "client_references_client_profile_id_idx"
  ON "adscale_app"."client_references" ("client_profile_id");
