CREATE TABLE "adscale_app"."pending_uploads" (
  "id" uuid PRIMARY KEY NOT NULL,
  "campaign_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "key" text NOT NULL,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "content_length" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pending_uploads_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."pending_uploads" ADD CONSTRAINT "pending_uploads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "adscale_app"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "adscale_app"."pending_uploads" ADD CONSTRAINT "pending_uploads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pending_uploads_campaign_id_idx" ON "adscale_app"."pending_uploads" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX "pending_uploads_workspace_id_idx" ON "adscale_app"."pending_uploads" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX "pending_uploads_status_expires_at_idx" ON "adscale_app"."pending_uploads" USING btree ("status","expires_at");
