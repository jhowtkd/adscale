-- R-006: durable per-output provider-call counter (absolute ceiling 2).
-- The constant DEFAULT 0 keeps this a metadata-only DDL on PG >= 11 (no
-- table rewrite). Accepted trade-off: rows still `processing` at deploy time
-- restart their lifetime budget at 0 — they may consume up to 2 fresh calls.
ALTER TABLE "adscale_app"."creative_work_outputs"
ADD COLUMN "image_call_count" integer DEFAULT 0 NOT NULL;
