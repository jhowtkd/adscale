DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "adscale_app"."credit_grants"
    WHERE abs("amount") > 214748364 OR abs("remaining") > 214748364
  ) THEN
    RAISE EXCEPTION 'Integer overflow guard triggered on credit_grants';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "adscale_app"."credit_transactions"
    WHERE abs("amount") > 214748364
  ) THEN
    RAISE EXCEPTION 'Integer overflow guard triggered on credit_transactions';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "adscale_app"."usage_events"
    WHERE "type" IN (
      'creative_plan', 'image_derivation', 'regeneration', 'restyling',
      'delivery_package_child', 'landing_page', 'creative_qa',
      'copy_generation', 'personaSimulation'
    )
    AND abs("amount") > 214748364
  ) THEN
    RAISE EXCEPTION 'Integer overflow guard triggered on usage_events';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "adscale_app"."credit_grants"
SET "amount" = "amount" * 10, "remaining" = "remaining" * 10;
--> statement-breakpoint
UPDATE "adscale_app"."credit_transactions"
SET "amount" = "amount" * 10;
--> statement-breakpoint
UPDATE "adscale_app"."usage_events"
SET "amount" = "amount" * 10
WHERE "type" IN (
  'creative_plan', 'image_derivation', 'regeneration', 'restyling',
  'delivery_package_child', 'landing_page', 'creative_qa',
  'copy_generation', 'personaSimulation'
);
--> statement-breakpoint
UPDATE "adscale_app"."beta_analytics_events"
SET "properties" = jsonb_set(
  "properties",
  '{creditUnitVersion}',
  '2'::jsonb,
  true
)
WHERE "event_key" IN ('credit_spend', 'credit_blocked');
--> statement-breakpoint
UPDATE "adscale_app"."beta_analytics_events"
SET "properties" = jsonb_set(
  "properties",
  '{estimateCredits}',
  to_jsonb(("properties"->>'estimateCredits')::numeric * 10),
  false
)
WHERE "event_key" IN ('credit_spend', 'credit_blocked')
  AND jsonb_typeof("properties"->'estimateCredits') = 'number';
--> statement-breakpoint
UPDATE "adscale_app"."beta_analytics_events"
SET "properties" = jsonb_set(
  "properties",
  '{actualCredits}',
  to_jsonb(("properties"->>'actualCredits')::numeric * 10),
  false
)
WHERE "event_key" IN ('credit_spend', 'credit_blocked')
  AND jsonb_typeof("properties"->'actualCredits') = 'number';
--> statement-breakpoint
UPDATE "adscale_app"."beta_analytics_events"
SET "properties" = jsonb_set(
  "properties",
  '{creditDelta}',
  to_jsonb(("properties"->>'creditDelta')::numeric * 10),
  false
)
WHERE "event_key" IN ('credit_spend', 'credit_blocked')
  AND jsonb_typeof("properties"->'creditDelta') = 'number';
