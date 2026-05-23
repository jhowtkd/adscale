ALTER TABLE "adscale_app"."user" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT true;
