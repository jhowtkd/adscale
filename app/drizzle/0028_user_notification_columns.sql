ALTER TABLE "adscale_app"."user" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "adscale_app"."user" ADD COLUMN IF NOT EXISTS "low_credits_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_app"."user" ADD COLUMN IF NOT EXISTS "trial_expiring_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "adscale_app"."user" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp;
