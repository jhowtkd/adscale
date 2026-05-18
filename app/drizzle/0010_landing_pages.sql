CREATE TABLE IF NOT EXISTS "adscale_app"."landing_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "source_derivation_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "title" text,
  "structure" jsonb,
  "html_key" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "adscale_app"."landing_pages"
  ADD CONSTRAINT "landing_pages_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id")
  ON DELETE cascade;

ALTER TABLE "adscale_app"."landing_pages"
  ADD CONSTRAINT "landing_pages_campaign_id_campaigns_id_fk"
  FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id")
  ON DELETE cascade;

ALTER TABLE "adscale_app"."landing_pages"
  ADD CONSTRAINT "landing_pages_source_derivation_id_derivations_id_fk"
  FOREIGN KEY ("source_derivation_id") REFERENCES "adscale_app"."derivations"("id")
  ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "landing_pages_workspace_id_idx"
  ON "adscale_app"."landing_pages" ("workspace_id");

CREATE INDEX IF NOT EXISTS "landing_pages_campaign_id_idx"
  ON "adscale_app"."landing_pages" ("campaign_id");

CREATE INDEX IF NOT EXISTS "landing_pages_source_derivation_id_idx"
  ON "adscale_app"."landing_pages" ("source_derivation_id");
