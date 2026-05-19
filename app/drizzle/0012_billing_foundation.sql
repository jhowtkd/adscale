CREATE TABLE IF NOT EXISTS "adscale_app"."billing_customers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "billing_customers_workspace_id_unique" UNIQUE("workspace_id"),
  CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."subscriptions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "billing_customer_id" uuid,
  "stripe_subscription_id" text NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "status" text NOT NULL,
  "plan_key" text NOT NULL,
  "price_id" text NOT NULL,
  "current_period_start" timestamp,
  "current_period_end" timestamp,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."credit_grants" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "source" text NOT NULL,
  "source_id" text,
  "amount" integer NOT NULL,
  "remaining" integer NOT NULL,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adscale_app"."processed_stripe_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "stripe_event_id" text NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb,
  "processed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "processed_stripe_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adscale_app"."billing_customers" ADD CONSTRAINT "billing_customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adscale_app"."subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adscale_app"."subscriptions" ADD CONSTRAINT "subscriptions_billing_customer_id_billing_customers_id_fk" FOREIGN KEY ("billing_customer_id") REFERENCES "adscale_app"."billing_customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adscale_app"."credit_grants" ADD CONSTRAINT "credit_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "adscale_app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_customers_workspace_id_idx" ON "adscale_app"."billing_customers" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_customers_stripe_customer_id_idx" ON "adscale_app"."billing_customers" USING btree ("stripe_customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_workspace_id_idx" ON "adscale_app"."subscriptions" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_billing_customer_id_idx" ON "adscale_app"."subscriptions" USING btree ("billing_customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "adscale_app"."subscriptions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_grants_workspace_id_idx" ON "adscale_app"."credit_grants" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_grants_source_id_idx" ON "adscale_app"."credit_grants" USING btree ("source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_stripe_events_stripe_event_id_idx" ON "adscale_app"."processed_stripe_events" USING btree ("stripe_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_stripe_events_type_idx" ON "adscale_app"."processed_stripe_events" USING btree ("type");
