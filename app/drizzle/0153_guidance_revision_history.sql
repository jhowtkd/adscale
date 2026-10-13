CREATE TABLE "adscale_app"."calibration_rule_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"origin" text NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_rule_revisions_positive_number" CHECK ("adscale_app"."calibration_rule_revisions"."revision_number" > 0),
	CONSTRAINT "calibration_rule_revisions_origin" CHECK ("adscale_app"."calibration_rule_revisions"."origin" in ('legacy', 'recorded'))
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_rule_revisions" ADD CONSTRAINT "calibration_rule_revisions_rule_id_calibration_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "adscale_app"."calibration_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_rule_revisions" ADD CONSTRAINT "calibration_rule_revisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."calibration_rule_revisions" ADD CONSTRAINT "calibration_rule_revisions_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_rule_revisions_rule_number_idx" ON "adscale_app"."calibration_rule_revisions" USING btree ("rule_id","revision_number");--> statement-breakpoint
CREATE INDEX "calibration_rule_revisions_brand_idx" ON "adscale_app"."calibration_rule_revisions" USING btree ("workspace_id","client_profile_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "adscale_app"."calibration_revision_support"(rule_snapshot jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH declared AS (
    SELECT value AS ref FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(rule_snapshot->'supporting_evidence_refs') = 'array'
        THEN rule_snapshot->'supporting_evidence_refs' ELSE '[]'::jsonb END)
  ), old_ids AS (
    SELECT value AS id FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(rule_snapshot->'supporting_signal_ids') = 'array'
        THEN rule_snapshot->'supporting_signal_ids' ELSE '[]'::jsonb END)
  ), verified AS (
    SELECT old.id,
      EXISTS (SELECT 1 FROM adscale_app.calibration_signals s WHERE s.id::text = old.id
        AND s.workspace_id::text = rule_snapshot->>'workspace_id' AND s.client_profile_id::text = rule_snapshot->>'client_profile_id') AS signal,
      EXISTS (SELECT 1 FROM adscale_app.human_quality_feedback_artifacts a WHERE a.id::text = old.id
        AND a.workspace_id::text = rule_snapshot->>'workspace_id' AND a.client_profile_id::text = rule_snapshot->>'client_profile_id') AS artifact
    FROM old_ids old
  ), refs AS (
    SELECT ref FROM declared
    UNION ALL
    SELECT jsonb_build_object('id', id, 'kind',
      CASE WHEN signal AND NOT artifact THEN 'calibration_signal'
        WHEN artifact AND NOT signal THEN 'feedback_artifact' ELSE 'legacy' END)
    FROM verified WHERE NOT EXISTS (SELECT 1 FROM declared WHERE ref->>'id' = verified.id)
  )
  SELECT COALESCE(jsonb_agg(ref), '[]'::jsonb) FROM refs;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "adscale_app"."capture_calibration_rule_revision"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  next_number integer;
BEGIN
  -- The projection row lock serializes writers. Timestamp-only refreshes are not revisions.
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO next_number
    FROM "adscale_app"."calibration_rule_revisions" WHERE rule_id = NEW.id;
  INSERT INTO "adscale_app"."calibration_rule_revisions"
    (rule_id, workspace_id, client_profile_id, revision_number, origin, content_hash, snapshot)
  VALUES (NEW.id, NEW.workspace_id, NEW.client_profile_id, next_number, 'recorded',
    encode(sha256(convert_to(NEW.rationale, 'UTF8')), 'hex'), to_jsonb(NEW) || jsonb_build_object('support_refs', adscale_app.calibration_revision_support(to_jsonb(NEW))));
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "adscale_app"."reject_calibration_revision_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Reuse the immutable Item-version policy: ownership deletion may cascade,
  -- while a direct revision delete/update must never rewrite history.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'calibration_rule_revision_immutable' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "calibration_rule_revisions_immutable"
  BEFORE UPDATE OR DELETE ON "adscale_app"."calibration_rule_revisions"
  FOR EACH ROW EXECUTE FUNCTION "adscale_app"."reject_calibration_revision_change"();
--> statement-breakpoint
CREATE TRIGGER "calibration_rule_revisions_no_truncate"
  BEFORE TRUNCATE ON "adscale_app"."calibration_rule_revisions"
  FOR EACH STATEMENT EXECUTE FUNCTION "adscale_app"."reject_calibration_revision_change"();
--> statement-breakpoint
DO $$
BEGIN
  -- One atomic statement works with the production statement-by-statement runner:
  -- no writer can fall between the legacy snapshot and installation of capture.
  LOCK TABLE "adscale_app"."calibration_rules" IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'calibration_rules_capture_revision'
    AND tgrelid = 'adscale_app.calibration_rules'::regclass) THEN
    CREATE TRIGGER "calibration_rules_capture_revision"
      AFTER INSERT OR UPDATE ON "adscale_app"."calibration_rules"
      FOR EACH ROW EXECUTE FUNCTION "adscale_app"."capture_calibration_rule_revision"();
  END IF;
  INSERT INTO "adscale_app"."calibration_rule_revisions"
    (rule_id, workspace_id, client_profile_id, revision_number, origin, content_hash, snapshot)
  SELECT id, workspace_id, client_profile_id, 1, 'legacy',
    encode(sha256(convert_to(rationale, 'UTF8')), 'hex'), to_jsonb(r) || jsonb_build_object('support_refs', adscale_app.calibration_revision_support(to_jsonb(r)))
  FROM "adscale_app"."calibration_rules" r
  ON CONFLICT (rule_id, revision_number) DO NOTHING;
END;
$$;
