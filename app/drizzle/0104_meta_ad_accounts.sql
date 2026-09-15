CREATE TABLE IF NOT EXISTS "adscale_app"."meta_ad_accounts" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" uuid NOT NULL,
  "ad_account_id" text NOT NULL,
  "name" text,
  "currency" text NOT NULL DEFAULT 'BRL',
  "brand_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."meta_ad_accounts"
  ADD CONSTRAINT "meta_ad_accounts_connection_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "adscale_app"."meta_connections"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."meta_ad_accounts"
  ADD CONSTRAINT "meta_ad_accounts_brand_id_client_profiles_id_fk"
  FOREIGN KEY ("brand_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_ad_accounts_connection_account_uq"
  ON "adscale_app"."meta_ad_accounts" ("connection_id", "ad_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_accounts_brand_id_idx"
  ON "adscale_app"."meta_ad_accounts" ("brand_id");
