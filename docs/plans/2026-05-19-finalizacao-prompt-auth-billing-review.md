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
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts
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

## Go / No-Go

Go for a controlled test-mode launch after production env values are configured and a manual Stripe smoke is completed.
