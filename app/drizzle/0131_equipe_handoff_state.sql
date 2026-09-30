ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD COLUMN "reading_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD COLUMN "reads_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD COLUMN "reading" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD COLUMN "captured" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_handoffs" ADD COLUMN "decisions" jsonb DEFAULT '{}'::jsonb NOT NULL;