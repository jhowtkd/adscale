CREATE TABLE IF NOT EXISTS "adscale_app"."served_ads" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL,
  "ad_account_id" text NOT NULL,
  "creative_id" text NOT NULL,
  "format" text NOT NULL,
  "text_excerpt" text,
  "media_image_key" text,
  "media_video_key" text,
  "media_thumb_key" text,
  "last_delivered_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ads"
  ADD CONSTRAINT "served_ads_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "adscale_app"."meta_ad_accounts"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ads"
  ADD CONSTRAINT "served_ads_format_check"
  CHECK ("format" in ('imagem','video','carrossel'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "served_ads_account_id_idx"
  ON "adscale_app"."served_ads" ("account_id");
