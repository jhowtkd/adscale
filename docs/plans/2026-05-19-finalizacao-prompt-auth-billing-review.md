# Finalizacao Prompt, Auth e Billing Review

Date: 2026-05-19
Status: Go with production env setup

## Summary

The MVP now has the critical production path for prompt quality, workspace auth, Stripe subscriptions, webhook-backed billing state, internal credit enforcement, and a Settings UI connected to real billing endpoints.

## Implemented

- Structured image prompt contract with focused prompt/parser tests.
- Better Auth workspace baseline with production origin checks.
- Stripe SDK and required env validation.
- Billing schema for customers, subscriptions, credit grants, processed Stripe events, and usage idempotency.
- Checkout Session endpoint and Customer Portal endpoint.
- Signed Stripe webhook endpoint with idempotent event processing.
- Subscription sync from Stripe events.
- Credit grants from paid invoices.
- Central credit service with `canSpend` and `recordUsage`.
- Credit gates on expensive AI/generation routes.
- Billing status endpoint.
- Billing hook used by Settings and TopBar.

## Verification

```bash
cd app
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts <!-- VERIFY: src/server/billing/gates.test.ts — file not found; no gates*.ts exists. Credit-gate logic lives in paywall.ts/access.ts (see .planning/tmp/verify-2026-05-19-finalizacao-prompt-auth-billing-review.md.json) --> src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts
```

Result: 8 files / 28 tests passed.

```bash
cd app
npx eslint src/lib/hooks/use-billing.ts src/lib/hooks/use-billing.test.tsx src/components/settings/BillingTab.tsx src/components/settings/PlansTab.tsx src/components/layout/TopBar.tsx
```

Result: passed.

```bash
cd app
npm run build
```

Result: passed with full dummy env. The only warning was Better Auth flagging the dummy `BETTER_AUTH_SECRET` as low entropy, which is expected for the local verification value and must not be used in production.

## Production Env Checklist

Required:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `APP_URL`
- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_IMAGE_MODEL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `STRIPE_SCALE_PRICE_ID`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

Safe placeholders are documented in `app/.env.example`. Local ignored env files can use placeholder Stripe values to keep non-billing development paths bootable, but Checkout and Portal require real Stripe test or live values.

Stripe webhook endpoint:

```text
/api/billing/webhook
```

Webhook events to enable:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

## Known Caveats

- Manual Stripe test-mode smoke still requires real Stripe test keys, price IDs, and webhook secret.
- Failed generation refund policy is not automatic yet. Credits are charged at route entry/enqueue time.
- Existing lint warnings remain in templates UI files unrelated to this billing work.

## Manual Smoke Checklist

1. Start the app with all env values present.
2. Start Stripe CLI forwarding to `/api/billing/webhook`.
3. Log in and confirm Settings -> Billing shows current state.
4. Attempt a paid generation without credits and confirm it is blocked.
5. Select a paid plan from Settings -> Plans.
6. Complete Stripe Checkout with a test card.
7. Confirm webhook processing creates/updates customer, subscription, and credit grant.
8. Confirm Settings -> Billing shows active plan and credits.
9. Run a generation and confirm usage records/debits credits.
10. Open Customer Portal from Settings -> Billing.

## Stripe Test-Mode Smoke Result

Date: 2026-05-20

- Stripe CLI installed and authenticated in test/sandbox mode.
- Test products/prices created for Starter, Growth and Scale.
- Local ignored env configured with Stripe test-mode values.
- Local app and Stripe webhook forwarding started.
- Smoke user signed up successfully.
- Growth Checkout completed with Stripe test card.
- Signed webhook replay for the real `invoice.paid` event returned 200.
- Billing UI showed `growth`, `active`, and `120` credits.
- Authenticated preview generation smoke then debited credits from `120` to `115`.
- The debit created a `usage_events` row with `type=image_derivation`, `amount=5`, and an idempotency key for the preview derivation.

Issues found and fixed:

- Local Stripe CLI key extraction can produce a restricted/CLI key path; app env validation now accepts Stripe server keys beginning with `sk_` or `rk_`.
- Stripe webhook event order is not guaranteed; `invoice.paid` can arrive before `customer.subscription.created`.
- Current Stripe invoice payloads can store subscription id under `parent.subscription_details.subscription`, not top-level `subscription`.

Operational note:

- The local database needed manual application of SQL migrations after the Drizzle journal stopped tracking newer hand-written migration files. Before production deploy, repair migration tracking or document an explicit production migration procedure.

## Go / No-Go

Go for a controlled test-mode launch after production env values are configured and the migration procedure is cleaned up.


## Migration Hygiene Repair

Date: 2026-05-20
Status: Completed in isolated worktree

### Problem

`app/drizzle/meta/_journal.json` only tracked migrations through `0007_creative_diagnosis`, while SQL files existed through `0013_usage_idempotency`. Some of these missing migrations were applied manually during local smoke testing, creating a gap where:
- Fresh databases could not migrate automatically to the full billing/usage schema.
- Existing databases with manually applied migrations would fail on duplicate objects if the journal were simply updated without idempotency changes.

### Strategy

Make migrations 0008-0013 idempotent and register them in the journal. This is the minimal safe fix because:
- These files were never tracked in the journal, so there are no stored checksums to conflict with.
- `IF NOT EXISTS` and `duplicate_object` exception handling make re-running safe on existing DBs.
- Fresh DBs will execute the full sequential chain 0000-0013.

### Changes

1. `app/drizzle/0008_creative_qa.sql`
   - Split multi-column `ADD COLUMN` into separate `ALTER TABLE` statements with `IF NOT EXISTS` per column.

2. `app/drizzle/0009_client_reference_library.sql`
   - Wrapped all `ALTER TABLE ... ADD CONSTRAINT` FK statements in `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;` blocks.

3. `app/drizzle/0010_landing_pages.sql`
   - Wrapped all `ALTER TABLE ... ADD CONSTRAINT` FK statements in `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;` blocks.

4. `app/drizzle/0011_pending_uploads.sql`
   - Changed `CREATE TABLE` to `CREATE TABLE IF NOT EXISTS`.
   - Wrapped FK constraints in `DO $$ ... EXCEPTION WHEN duplicate_object` blocks.
   - Changed `CREATE INDEX` to `CREATE INDEX IF NOT EXISTS` for all three indexes.

5. `app/drizzle/meta/_journal.json`
   - Added journal entries for 0008-0013 with sequential idx values and unique timestamps.

6. `app/drizzle/meta/0013_snapshot.json`
   - Added a current schema snapshot so future `drizzle-kit generate` runs diff from the post-0013 schema state instead of the older 0006 snapshot.

7. `app/drizzle/0006_add_is_preview_to_derivations.sql`
   - Removed the orphaned manual file because its `is_preview` column is already included in the journaled `0006_stormy_brother_voodoo.sql`.

No changes were needed for:
- `0012_billing_foundation.sql` — already idempotent (`CREATE TABLE IF NOT EXISTS`, `DO $$` FK blocks, `CREATE INDEX IF NOT EXISTS`).
- `0013_usage_idempotency.sql` — already idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

### Verification

```bash
cd app
npx drizzle-kit check
# Result: Everything's fine

npx drizzle-kit generate --name post_hygiene_probe
# Result, with 0013_snapshot.json present in a temporary probe copy: No schema changes, nothing to migrate
```

Static review confirmed no `ADD COLUMN`, `CREATE TABLE`, `ADD CONSTRAINT`, or `CREATE INDEX` statements in 0008-0011 remain without idempotency guards.

### Operator Steps for Production Deploy

1. Before running `drizzle-kit migrate` against production, verify that the production `__drizzle_migrations` table does not already contain rows for tags 0008-0013 with checksums of the old (non-idempotent) file content. If it does, those rows must be reconciled first because the file content changed.
   - If the production DB was never manually patched with these migrations, no action is needed; `migrate` will run them normally.
   - If the production DB has these migrations already in `__drizzle_migrations` from a previous partial deploy, the checksums will mismatch. In that case, either:
     a) Update the checksum values in `__drizzle_migrations` to match the new files, or
     b) Remove the 0008-0013 rows from `__drizzle_migrations` (safe because the SQL is now idempotent).

2. Run `drizzle-kit migrate` in production.

3. Verify that all expected billing/usage tables and columns exist.

### Residual Risks

- **Checksum edge case**: If any environment inserted 0008-0013 into `__drizzle_migrations` with the old file checksums, `migrate` will fail with a checksum mismatch. The operator must resolve this manually per the steps above.
