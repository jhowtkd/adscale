CREATE TABLE "adscale_app"."guidance_selection_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."guidance_selections" (
	"client_profile_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinned_by" text,
	"pinned_at" timestamp,
	"previous_selection" jsonb,
	CONSTRAINT "guidance_selections_version" CHECK ("adscale_app"."guidance_selections"."version" >= 0),
	CONSTRAINT "guidance_selections_pin" CHECK (("adscale_app"."guidance_selections"."pinned_by" is null) = ("adscale_app"."guidance_selections"."pinned_at" is null))
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."guidance_selection_pins" ADD CONSTRAINT "guidance_selection_pins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."guidance_selection_pins" ADD CONSTRAINT "guidance_selection_pins_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."guidance_selections" ADD CONSTRAINT "guidance_selections_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."guidance_selections" ADD CONSTRAINT "guidance_selections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."guidance_selections" ADD CONSTRAINT "guidance_selections_pinned_by_user_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guidance_selection_pins_brand_version_idx" ON "adscale_app"."guidance_selection_pins" USING btree ("client_profile_id","expected_version");--> statement-breakpoint
CREATE OR REPLACE FUNCTION adscale_app.guidance_approved_fields(snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(snapshot->'status', snapshot->'rationale', snapshot->'confirmed_metadata',
    snapshot->'metadata_confirmed_by', snapshot->'metadata_confirmed_at', snapshot->'approved_by', snapshot->'approved_at');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION adscale_app.follow_calibration_rule_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previous_snapshot jsonb;
  selected adscale_app.guidance_selections%ROWTYPE;
  next_refs jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM adscale_app.calibration_rules WHERE id = NEW.rule_id) THEN RETURN NEW; END IF;
  IF NEW.snapshot->>'status' NOT IN ('approved', 'deprecated', 'rejected') THEN RETURN NEW; END IF;
  SELECT snapshot INTO previous_snapshot FROM adscale_app.calibration_rule_revisions
    WHERE rule_id = NEW.rule_id AND revision_number < NEW.revision_number ORDER BY revision_number DESC LIMIT 1;
  -- Draft/evidence edits do not replace the approved selection with a review revision.
  IF NEW.snapshot->>'status' = 'approved' AND
    adscale_app.guidance_approved_fields(previous_snapshot) = adscale_app.guidance_approved_fields(NEW.snapshot) THEN RETURN NEW; END IF;
  INSERT INTO adscale_app.guidance_selections (workspace_id, client_profile_id)
    VALUES (NEW.workspace_id, NEW.client_profile_id) ON CONFLICT (client_profile_id) DO NOTHING;
  SELECT * INTO selected FROM adscale_app.guidance_selections
    WHERE client_profile_id = NEW.client_profile_id FOR UPDATE;
  IF selected.pinned_by IS NOT NULL THEN RETURN NEW; END IF;
  SELECT coalesce(jsonb_agg(value), '[]'::jsonb) INTO next_refs FROM jsonb_array_elements(selected.refs)
    WHERE value->>'ruleId' <> NEW.rule_id::text;
  IF NEW.snapshot->>'status' = 'approved' THEN
    next_refs := next_refs || jsonb_build_array(jsonb_build_object('ruleId', NEW.rule_id,
      'revision', NEW.revision_number, 'contentHash', NEW.content_hash));
  END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'ruleId' COLLATE "C"), '[]'::jsonb)
    INTO next_refs FROM jsonb_array_elements(next_refs);
  IF next_refs IS DISTINCT FROM selected.refs THEN
    UPDATE adscale_app.guidance_selections SET refs = next_refs, version = version + 1
      WHERE client_profile_id = NEW.client_profile_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guidance_selection_pins_immutable BEFORE UPDATE OR DELETE ON adscale_app.guidance_selection_pins
  FOR EACH ROW EXECUTE FUNCTION adscale_app.reject_calibration_revision_change();
--> statement-breakpoint
CREATE TRIGGER guidance_selection_pins_no_truncate BEFORE TRUNCATE ON adscale_app.guidance_selection_pins
  FOR EACH STATEMENT EXECUTE FUNCTION adscale_app.reject_calibration_revision_change();
--> statement-breakpoint
DO $$
BEGIN
  -- Install capture and initialize future numeric selections atomically. Applied legacy records are untouched.
  LOCK TABLE adscale_app.calibration_rules IN SHARE ROW EXCLUSIVE MODE;
  -- Follow at commit, after all rule locks (including cap retirement), to avoid rule/selection lock inversion.
  CREATE CONSTRAINT TRIGGER calibration_revisions_follow_selection AFTER INSERT ON adscale_app.calibration_rule_revisions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION adscale_app.follow_calibration_rule_revision();
  INSERT INTO adscale_app.guidance_selections (workspace_id, client_profile_id, version, refs)
  SELECT workspace_id, client_profile_id, 1, jsonb_agg(jsonb_build_object('ruleId', rule_id,
    'revision', revision_number, 'contentHash', content_hash) ORDER BY rule_id)
  FROM (
    SELECT DISTINCT ON (h.rule_id) h.* FROM adscale_app.calibration_rule_revisions h
    JOIN adscale_app.calibration_rules r ON r.id = h.rule_id
    WHERE h.snapshot->>'status' = 'approved' AND r.status NOT IN ('deprecated', 'rejected')
    ORDER BY h.rule_id, h.revision_number DESC
  ) approved GROUP BY workspace_id, client_profile_id
  ON CONFLICT (client_profile_id) DO NOTHING;
END;
$$;
