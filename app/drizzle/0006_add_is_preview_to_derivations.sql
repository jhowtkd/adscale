-- Migration: Add isPreview column to derivations
ALTER TABLE adscale_app.derivations ADD COLUMN is_preview boolean NOT NULL DEFAULT false;