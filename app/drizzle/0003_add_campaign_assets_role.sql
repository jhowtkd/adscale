ALTER TABLE "adscale_app"."campaign_assets" ADD COLUMN "role" text NOT NULL DEFAULT 'base';
ALTER TABLE "adscale_app"."campaign_assets" ADD CONSTRAINT "campaign_assets_role_check" CHECK (role IN ('base', 'style_reference'));
