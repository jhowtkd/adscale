CREATE TABLE "adscale_app"."derivation_copy_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"derivation_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"cta_text" text,
	"tone_label" text,
	"confidence_score" integer,
	"is_selected" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."derivation_copy_variants" ADD CONSTRAINT "derivation_copy_variants_derivation_id_derivations_id_fk" FOREIGN KEY ("derivation_id") REFERENCES "adscale_app"."derivations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_app"."derivation_copy_variants" ADD CONSTRAINT "derivation_copy_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "derivation_copy_variants_derivation_id_idx" ON "adscale_app"."derivation_copy_variants" USING btree ("derivation_id");--> statement-breakpoint
CREATE INDEX "derivation_copy_variants_workspace_id_idx" ON "adscale_app"."derivation_copy_variants" USING btree ("workspace_id");