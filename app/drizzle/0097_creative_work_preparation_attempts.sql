CREATE TABLE IF NOT EXISTS "adscale_app"."creative_work_preparation_attempts" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "work_item_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "input_revision" text NOT NULL,
  "input_fingerprint" text NOT NULL,
  "state" text NOT NULL DEFAULT 'running',
  "lease_expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_preparation_attempts"
  ADD CONSTRAINT "creative_work_preparation_attempts_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_preparation_attempts"
  ADD CONSTRAINT "creative_work_preparation_attempts_work_item_id_fk"
  FOREIGN KEY ("work_item_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_preparation_attempts"
  ADD CONSTRAINT "creative_work_preparation_attempts_state_check"
  CHECK ("state" in ('running','completed','failed','invalidated'));
--> statement-breakpoint
ALTER TABLE "adscale_app"."creative_work_preparation_attempts"
  ADD CONSTRAINT "creative_work_preparation_attempts_kind_check"
  CHECK ("kind" in ('creative_prepare','carousel_plan','carousel_prepare'));
--> statement-breakpoint
-- A exclusao mutua e do banco: no maximo uma tentativa viva por Trabalho.
CREATE UNIQUE INDEX IF NOT EXISTS "creative_work_preparation_attempts_active_uq"
  ON "adscale_app"."creative_work_preparation_attempts" ("work_item_id")
  WHERE "state" = 'running';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_work_preparation_attempts_scope_idx"
  ON "adscale_app"."creative_work_preparation_attempts" ("workspace_id", "work_item_id", "updated_at");
