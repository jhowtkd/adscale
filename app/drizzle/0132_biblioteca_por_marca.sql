CREATE TABLE "adscale_equipe"."equipe_brand_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"client_profile_id" uuid NOT NULL,
	"kind" text DEFAULT 'diagnosis' NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_by_role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_brand_documents_version_ck" CHECK ("adscale_equipe"."equipe_brand_documents"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "adscale_app"."client_profiles" ADD COLUMN "social_links" jsonb;--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_assets" ADD COLUMN "client_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_documents" ADD CONSTRAINT "equipe_brand_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_documents" ADD CONSTRAINT "equipe_brand_documents_account_id_equipe_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "adscale_equipe"."equipe_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adscale_equipe"."equipe_brand_documents" ADD CONSTRAINT "equipe_brand_documents_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_brand_documents_version_uq" ON "adscale_equipe"."equipe_brand_documents" USING btree ("account_id","kind","version");--> statement-breakpoint
CREATE INDEX "equipe_brand_documents_brand_idx" ON "adscale_equipe"."equipe_brand_documents" USING btree ("workspace_id","client_profile_id");--> statement-breakpoint
ALTER TABLE "adscale_app"."workspace_assets" ADD CONSTRAINT "workspace_assets_client_profile_id_client_profiles_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "adscale_app"."client_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_assets_brand_idx" ON "adscale_app"."workspace_assets" USING btree ("workspace_id","client_profile_id");--> statement-breakpoint
CREATE FUNCTION "adscale_equipe"."reject_brand_document_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'brand_document_versions_are_immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "equipe_brand_documents_immutable"
BEFORE UPDATE ON "adscale_equipe"."equipe_brand_documents"
FOR EACH ROW EXECUTE FUNCTION "adscale_equipe"."reject_brand_document_update"();
