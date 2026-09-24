CREATE TABLE "adscale_app"."creative_work_comparison_leases" (
	"work_item_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token" uuid NOT NULL,
	"lease_expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_comparison_leases" ADD CONSTRAINT "creative_work_comparison_leases_work_fk" FOREIGN KEY ("work_item_id","workspace_id") REFERENCES "adscale_app"."creative_work_items"("id","workspace_id") ON DELETE cascade ON UPDATE no action;