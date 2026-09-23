CREATE INDEX "campaign_assets_workspace_id_cursor_idx" ON "adscale_app"."campaign_assets" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "campaigns_workspace_id_cursor_idx" ON "adscale_app"."campaigns" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "creative_plans_workspace_id_cursor_idx" ON "adscale_app"."creative_plans" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "derivations_workspace_id_cursor_idx" ON "adscale_app"."derivations" USING btree ("workspace_id","id");