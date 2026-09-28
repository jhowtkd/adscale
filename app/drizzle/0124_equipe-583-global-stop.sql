CREATE TABLE "adscale_equipe"."equipe_global_stops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text NOT NULL,
	"stopped_by" text NOT NULL,
	"stopped_at" timestamp DEFAULT now() NOT NULL,
	"lifted_at" timestamp,
	"lifted_by" text,
	"lift_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_global_stops_status_check" CHECK ("adscale_equipe"."equipe_global_stops"."status" in ('active', 'lifted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "equipe_global_stops_single_active_uq" ON "adscale_equipe"."equipe_global_stops" USING btree ("status") WHERE "adscale_equipe"."equipe_global_stops"."status" = 'active';