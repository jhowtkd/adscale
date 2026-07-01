-- Add revoked_at to share_links so tokens can be revoked before expiry.
-- validateShareToken() treats a non-null revoked_at as invalid.
ALTER TABLE "adscale_app"."share_links"
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp;
