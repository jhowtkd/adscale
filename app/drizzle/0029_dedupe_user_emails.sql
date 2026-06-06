-- Normalize emails and remove duplicate user rows that break email/password sign-in.
UPDATE "adscale_app"."user"
SET email = lower(trim(email)),
    updated_at = NOW()
WHERE email <> lower(trim(email));--> statement-breakpoint

WITH ranked AS (
  SELECT
    u.id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(u.email))
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM "adscale_app"."account" a
            WHERE a.user_id = u.id
              AND a.provider_id = 'credential'
              AND a.password IS NOT NULL
          ) THEN 0
          ELSE 1
        END,
        u.created_at DESC
    ) AS rn
  FROM "adscale_app"."user" u
)
DELETE FROM "adscale_app"."user" u
USING ranked r
WHERE u.id = r.id
  AND r.rn > 1;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "adscale_app"."user" ("email");
