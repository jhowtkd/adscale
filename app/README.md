# ADScale App

Next.js app for ADScale campaign generation, auth, Stripe billing, and credit-gated AI usage.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env:

```bash
cp .env.example .env.local
```

3. Fill real local credentials in `.env.local`.

4. Run the app with Inngest dev wiring:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Required Env

The app validates env at server module load. A missing value can break tests, build, or route execution.

Core:

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

Stripe:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `STRIPE_SCALE_PRICE_ID`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

## Stripe Test Mode Setup

Create three recurring Prices in Stripe test mode and map them to:

- Starter -> `STRIPE_STARTER_PRICE_ID`
- Growth -> `STRIPE_GROWTH_PRICE_ID`
- Scale -> `STRIPE_SCALE_PRICE_ID`

Configure a webhook endpoint:

```text
<APP_URL>/api/billing/webhook
```

Enable events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

For local webhook testing with Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Use the emitted `whsec_...` value as `STRIPE_WEBHOOK_SECRET`.

## Verification

Focused billing/auth/prompt tests:

```bash
npm run test -- src/lib/hooks/use-billing.test.tsx src/server/billing/events.test.ts src/app/api/billing/webhook/route.test.ts src/server/billing/credits.test.ts src/server/billing/paywall.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/app/api/billing/portal/route.test.ts tests/integration/auth-workspace-access.test.ts src/server/ai/prompt-builder.test.ts tests/unit/prompt-parser.test.ts
```

Schema check:

```bash
npx drizzle-kit check
```

Migration hygiene note: The Drizzle journal and latest snapshot track migrations 0000-0013. Migrations 0008-0013 were made idempotent with `IF NOT EXISTS` / `duplicate_object` exception blocks so they are safe to re-run on databases where they may have been manually applied. If your `__drizzle_migrations` table already contains rows for 0008-0013 with old checksums, reconcile those rows before running `migrate`.

Lint and build:

```bash
npm run lint
npm run build
```

## Manual Stripe Smoke

1. Start app and Inngest locally.
2. Start Stripe CLI forwarding to `/api/billing/webhook`.
3. Sign up or log in.
4. Confirm Settings -> Billing shows no active plan or zero credits.
5. Try a paid generation and confirm it is blocked before enqueue.
6. Go to Settings -> Plans and select a paid plan.
7. Complete Stripe Checkout with a test card.
8. Confirm webhook logs process checkout/subscription/invoice events.
9. Confirm Settings -> Billing shows active plan and credits.
10. Trigger a generation and confirm credits decrease.
11. Open Customer Portal from Settings -> Billing.
