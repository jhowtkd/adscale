CREATE TABLE IF NOT EXISTS "adscale_app"."brand_commercial_offers" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "client_profile_id" uuid NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "slug" text NOT NULL,
  "document" jsonb NOT NULL,
  "origin_work_id" uuid NOT NULL,
  "valid_from" timestamp NOT NULL,
  "valid_until" timestamp NOT NULL,
  "superseded_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_commercial_offers"
  ADD CONSTRAINT "brand_commercial_offers_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_commercial_offers"
  ADD CONSTRAINT "brand_commercial_offers_client_profile_id_fk"
  FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."brand_commercial_offers"
  ADD CONSTRAINT "brand_commercial_offers_origin_work_id_fk"
  FOREIGN KEY ("origin_work_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_commercial_offers_brand_cursor_idx"
  ON "adscale_app"."brand_commercial_offers" ("workspace_id", "client_profile_id", "updated_at", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_commercial_offers_slug_version_uq"
  ON "adscale_app"."brand_commercial_offers" ("workspace_id", "client_profile_id", "slug", "version");
