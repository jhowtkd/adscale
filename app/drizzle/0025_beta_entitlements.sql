CREATE TABLE "adscale_app"."workspace_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"source_code" text,
	"redeemed_by_user_id" text,
	"metadata" jsonb,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adscale_app"."beta_access_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beta_access_redemptions_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_entitlements" ADD CONSTRAINT "workspace_entitlements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_entitlements" ADD CONSTRAINT "workspace_entitlements_redeemed_by_user_id_user_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "adscale_app"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_access_redemptions" ADD CONSTRAINT "beta_access_redemptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_access_redemptions" ADD CONSTRAINT "beta_access_redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "adscale_app"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."beta_access_redemptions" ADD CONSTRAINT "beta_access_redemptions_entitlement_id_workspace_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "adscale_app"."workspace_entitlements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_entitlements_workspace_id_idx" ON "adscale_app"."workspace_entitlements" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX "workspace_entitlements_kind_status_idx" ON "adscale_app"."workspace_entitlements" USING btree ("kind","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_entitlements_workspace_kind_uidx" ON "adscale_app"."workspace_entitlements" USING btree ("workspace_id","kind");
--> statement-breakpoint
CREATE INDEX "beta_access_redemptions_user_id_idx" ON "adscale_app"."beta_access_redemptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "beta_access_redemptions_entitlement_id_idx" ON "adscale_app"."beta_access_redemptions" USING btree ("entitlement_id");
