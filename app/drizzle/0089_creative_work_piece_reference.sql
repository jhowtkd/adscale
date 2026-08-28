ALTER TABLE "adscale_app"."creative_work_sources"
  ADD COLUMN IF NOT EXISTS "piece_reference" jsonb;

-- Manual retries are financially distinct from provider/job retry_count.  Keep
-- this nullable so historical outputs retain their original settlement keys.
ALTER TABLE "adscale_app"."creative_work_outputs"
  ADD COLUMN IF NOT EXISTS "manual_retry_attempt" integer;
