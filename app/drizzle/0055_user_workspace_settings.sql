ALTER TABLE "adscale_app"."user" ADD COLUMN IF NOT EXISTS "bio" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."user" ADD COLUMN IF NOT EXISTS "timezone" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspaces" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspaces" ADD COLUMN IF NOT EXISTS "industry" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspaces" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspaces" ADD COLUMN IF NOT EXISTS "timezone" text;
