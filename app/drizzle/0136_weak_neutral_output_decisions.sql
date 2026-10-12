DO $$ BEGIN
  ALTER TABLE "adscale_app"."output_decision_events"
    DROP CONSTRAINT IF EXISTS "output_decision_events_action_check";
  ALTER TABLE "adscale_app"."output_decision_events"
    ADD CONSTRAINT "output_decision_events_action_check" CHECK (
      "action" IN ('approved', 'rejected', 'regenerated', 'saved_reference', 'selected_for_delivery',
        'alternative_not_selected', 'favorited', 'favorite_removed', 'selection_replaced',
        'variation_requested', 'format_adapted', 'layer_regenerated')
    );
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "adscale_app"."output_decision_events"
    DROP CONSTRAINT IF EXISTS "output_decision_events_direction_check";
  ALTER TABLE "adscale_app"."output_decision_events"
    ADD CONSTRAINT "output_decision_events_direction_check" CHECK (
      "direction" IN ('positive', 'negative', 'corrective', 'neutral')
    );
END $$;
