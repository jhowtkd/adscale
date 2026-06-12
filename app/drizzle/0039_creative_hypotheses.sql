CREATE TABLE "adscale_app"."creative_hypotheses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text,
	"variable_key" text NOT NULL,
	"primary_metric" text NOT NULL,
	"expected_direction" text NOT NULL,
	"rationale" text NOT NULL,
	"kind" text DEFAULT 'controlled_hypothesis' NOT NULL,
	"platform" text,
	"period_start" date,
	"period_end" date,
	"outcome" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_comparison_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creative_hypotheses_expected_direction_check" CHECK ("expected_direction" in ('increase', 'decrease')),
	CONSTRAINT "creative_hypotheses_kind_check" CHECK ("kind" in ('controlled_hypothesis', 'observational')),
	CONSTRAINT "creative_hypotheses_outcome_check" CHECK ("outcome" is null or "outcome" in ('supported', 'contradicted', 'inconclusive')),
	CONSTRAINT "creative_hypotheses_status_check" CHECK ("status" in ('draft', 'active', 'concluded'))
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."hypothesis_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hypothesis_id" uuid NOT NULL,
	"derivation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hypothesis_variants_role_check" CHECK ("role" in ('control', 'variant'))
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."variant_comparisons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"hypothesis_id" uuid,
	"kind" text NOT NULL,
	"verdict" text NOT NULL,
	"primary_metric" text NOT NULL,
	"expected_direction" text,
	"winner_derivation_id" uuid,
	"outcome" text,
	"platform" text,
	"period_start" date,
	"period_end" date,
	"exclusion_reasons" jsonb,
	"variant_results" jsonb,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "variant_comparisons_kind_check" CHECK ("kind" in ('controlled_hypothesis', 'observational')),
	CONSTRAINT "variant_comparisons_verdict_check" CHECK ("verdict" in ('winner', 'no_clear_winner', 'insufficient_evidence', 'not_comparable')),
	CONSTRAINT "variant_comparisons_outcome_check" CHECK ("outcome" is null or "outcome" in ('supported', 'contradicted', 'inconclusive'))
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_hypotheses" ADD CONSTRAINT "creative_hypotheses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_hypotheses" ADD CONSTRAINT "creative_hypotheses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_hypotheses" ADD CONSTRAINT "creative_hypotheses_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."hypothesis_variants" ADD CONSTRAINT "hypothesis_variants_hypothesis_id_creative_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "adscale_app"."creative_hypotheses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."hypothesis_variants" ADD CONSTRAINT "hypothesis_variants_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."variant_comparisons" ADD CONSTRAINT "variant_comparisons_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."variant_comparisons" ADD CONSTRAINT "variant_comparisons_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."variant_comparisons" ADD CONSTRAINT "variant_comparisons_hypothesis_id_creative_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "adscale_app"."creative_hypotheses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."variant_comparisons" ADD CONSTRAINT "variant_comparisons_winner_derivation_id_derivations_id_fk" FOREIGN KEY ("winner_derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."variant_comparisons" ADD CONSTRAINT "variant_comparisons_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "creative_hypotheses_workspace_campaign_idx" ON "adscale_app"."creative_hypotheses" USING btree ("workspace_id","campaign_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hypothesis_variants_hypothesis_derivation_uq" ON "adscale_app"."hypothesis_variants" USING btree ("hypothesis_id","derivation_id");
--> statement-breakpoint
CREATE INDEX "hypothesis_variants_derivation_idx" ON "adscale_app"."hypothesis_variants" USING btree ("derivation_id");
--> statement-breakpoint
CREATE INDEX "variant_comparisons_workspace_campaign_idx" ON "adscale_app"."variant_comparisons" USING btree ("workspace_id","campaign_id");
--> statement-breakpoint
CREATE INDEX "variant_comparisons_hypothesis_idx" ON "adscale_app"."variant_comparisons" USING btree ("hypothesis_id");
