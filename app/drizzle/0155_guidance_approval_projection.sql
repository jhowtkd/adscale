CREATE TABLE "adscale_app"."guidance_proposal_approvals" (
	"kind" text NOT NULL,
	"proposal_id" uuid NOT NULL,
	"expected_revision" text NOT NULL,
	"rule_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "guidance_proposal_approvals_kind_proposal_id_pk" PRIMARY KEY("kind","proposal_id"),
	CONSTRAINT "guidance_proposal_approvals_kind" CHECK ("adscale_app"."guidance_proposal_approvals"."kind" in ('rule', 'corpus_quality'))
);
--> statement-breakpoint
-- Legacy rules keep their identities; no historical slice or approval request is guessed.
ALTER TABLE "adscale_app"."calibration_rules" ADD COLUMN "supported_slice_key" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."guidance_proposal_approvals" ADD CONSTRAINT "guidance_proposal_approvals_rule_id_calibration_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "adscale_app"."calibration_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_rules_supported_slice_idx" ON "adscale_app"."calibration_rules" USING btree ("workspace_id","client_profile_id","category","supported_slice_key");--> statement-breakpoint
CREATE TRIGGER "guidance_proposal_approvals_immutable"
  BEFORE UPDATE OR DELETE ON "adscale_app"."guidance_proposal_approvals"
  FOR EACH ROW EXECUTE FUNCTION "adscale_app"."reject_calibration_revision_change"();
--> statement-breakpoint
CREATE TRIGGER "guidance_proposal_approvals_no_truncate"
  BEFORE TRUNCATE ON "adscale_app"."guidance_proposal_approvals"
  FOR EACH STATEMENT EXECUTE FUNCTION "adscale_app"."reject_calibration_revision_change"();
