CREATE TABLE IF NOT EXISTS "adscale_app"."served_ad_metrics" (
  "anuncio_id" text NOT NULL,
  "window_days" integer NOT NULL,
  "impressions" integer NOT NULL DEFAULT 0,
  "clicks" integer NOT NULL DEFAULT 0,
  "spend" numeric(14, 2) NOT NULL DEFAULT 0,
  "conversions" integer NOT NULL DEFAULT 0,
  "synced_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("anuncio_id", "window_days")
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_metrics"
  ADD CONSTRAINT "served_ad_metrics_anuncio_id_fk"
  FOREIGN KEY ("anuncio_id") REFERENCES "adscale_app"."served_ads"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."served_ad_metrics"
  ADD CONSTRAINT "served_ad_metrics_window_check"
  CHECK ("window_days" in (7, 30, 90));
