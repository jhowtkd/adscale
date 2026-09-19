ALTER TABLE "adscale_app"."share_links" ALTER COLUMN "campaign_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "adscale_app"."share_links" ADD COLUMN IF NOT EXISTS "creative_work_id" uuid;
--> statement-breakpoint
ALTER TABLE "adscale_app"."share_links" ADD COLUMN IF NOT EXISTS "output_id" uuid;
--> statement-breakpoint
ALTER TABLE "adscale_app"."share_links" ADD COLUMN IF NOT EXISTS "output_version" integer;
--> statement-breakpoint
ALTER TABLE "adscale_app"."share_links"
  ADD CONSTRAINT "share_links_creative_work_id_fk"
  FOREIGN KEY ("creative_work_id") REFERENCES "adscale_app"."creative_work_items"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."share_links"
  ADD CONSTRAINT "share_links_output_id_fk"
  FOREIGN KEY ("output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."share_links"
  ADD CONSTRAINT "share_links_package_check"
  CHECK (
    (
      "campaign_id" IS NOT NULL
      AND "creative_work_id" IS NULL
      AND "output_id" IS NULL
    )
    OR (
      "campaign_id" IS NULL
      AND "creative_work_id" IS NOT NULL
      AND "output_id" IS NOT NULL
      AND "output_version" IS NOT NULL
    )
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "share_links_active_output_uq"
  ON "adscale_app"."share_links" ("output_id")
  WHERE "revoked_at" IS NULL AND "output_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."piece_review_comments" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "share_link_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "output_id" uuid NOT NULL,
  "output_version" integer NOT NULL,
  "author_label" text NOT NULL,
  "decision" text NOT NULL,
  "body" text,
  "area" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."piece_review_comments"
  ADD CONSTRAINT "piece_review_comments_share_link_id_fk"
  FOREIGN KEY ("share_link_id") REFERENCES "adscale_app"."share_links"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."piece_review_comments"
  ADD CONSTRAINT "piece_review_comments_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "adscale_app"."piece_review_comments"
  ADD CONSTRAINT "piece_review_comments_output_id_fk"
  FOREIGN KEY ("output_id") REFERENCES "adscale_app"."creative_work_outputs"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "adscale_app"."piece_review_comments"
  ADD CONSTRAINT "piece_review_comments_decision_check"
  CHECK ("decision" IN ('comment','approve','request_changes'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "piece_review_comments_share_idx"
  ON "adscale_app"."piece_review_comments" ("share_link_id", "created_at", "id");
