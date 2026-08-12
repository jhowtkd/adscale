-- Brand Cortex S02: approved, renderable font files linked to a client profile.
ALTER TABLE "adscale_app"."client_profiles"
  ADD COLUMN IF NOT EXISTS "brand_font_assets" jsonb;
