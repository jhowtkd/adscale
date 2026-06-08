CREATE TABLE "adscale_app"."waitlist_signups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "sector" text NOT NULL,
  "sector_other" text,
  "whatsapp" text NOT NULL,
  "consent_at" timestamp NOT NULL,
  "consent_version" text NOT NULL,
  "locale" text NOT NULL DEFAULT 'pt-BR',
  "source" text NOT NULL DEFAULT 'marketing-site',
  "resend_contact_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_email_uidx" ON "adscale_app"."waitlist_signups" USING btree ("email");
