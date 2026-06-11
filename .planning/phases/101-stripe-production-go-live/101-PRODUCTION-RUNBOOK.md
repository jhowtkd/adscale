# Stripe Production Go-Live Runbook

**Phase:** 101 — Stripe Production Go-Live  
**Audience:** Operator with Render Dashboard + Stripe Dashboard access  
**Date:** 2026-06-11  
**Requirements:** LIVE-01 (checklist), LIVE-02 (signed webhook smoke)

> **Secrets policy:** This document lists environment variable **names only**. Never commit `sk_live_*`, `whsec_*`, or full price IDs to git. Set values in Render Dashboard or a local `.env.local` (gitignored).

## Prerequisites

- [ ] Phases 97–100 merged and deployed (billing contracts, past-due policy, conversion surfaces, BillingTab).
- [ ] Production app URL confirmed: `APP_URL` / `BETTER_AUTH_URL` (see `render.yaml`).
- [ ] Operator Stripe account with **Live mode** enabled.
- [ ] Controlled operator workspace (not a paying customer) for checkout/portal smoke.

## 1. Stripe Dashboard (Live mode)

Toggle Stripe Dashboard to **Live** before creating production artifacts.

### 1.1 Products and prices

Create three recurring monthly prices (or reuse existing live products):

| Plan    | Env var                     | Credits/mo (`plans.ts`) |
|---------|-----------------------------|-------------------------|
| Starter | `STRIPE_STARTER_PRICE_ID`   | 30                      |
| Growth  | `STRIPE_GROWTH_PRICE_ID`    | 120                     |
| Scale   | `STRIPE_SCALE_PRICE_ID`     | 360                     |

- [ ] Each price ID starts with `price_` and is **livemode** (`livemode: true` in API).
- [ ] Prices are **recurring / monthly**.
- [ ] Copy each `price_...` ID into Render (names above — not into git).

### 1.2 API keys

| Env var              | Source                                      |
|----------------------|---------------------------------------------|
| `STRIPE_SECRET_KEY`  | Stripe → Developers → API keys → **Secret** (`sk_live_...` or restricted `rk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Created when registering webhook (step 1.3) |

- [ ] Use a **restricted key** in production if possible (billing + customers read/write only).
- [ ] Never paste keys into chat, commits, or this file.

### 1.3 Webhook endpoint

Register in Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

| Field    | Value |
|----------|-------|
| URL      | `{APP_URL}/api/billing/webhook` |
| Example  | `https://adscale.jhonatansoares.com/api/billing/webhook` |

**Events to enable:**

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

- [ ] Copy signing secret into Render as `STRIPE_WEBHOOK_SECRET` (`whsec_...`).
- [ ] Confirm endpoint shows “Enabled” after deploy.

### 1.4 Customer portal

- [ ] Billing Portal configuration exists (Business settings → Customer portal).
- [ ] Features enabled: payment method update, invoice history, subscription cancel (at period end recommended).
- [ ] Return URL matches `STRIPE_SUCCESS_URL` origin.

## 2. Render Dashboard

All Stripe vars are `sync: false` in `render.yaml` — set manually per environment.

### 2.1 Required env vars (names only)

| Variable | Notes |
|----------|-------|
| `STRIPE_SECRET_KEY` | Live secret key |
| `STRIPE_WEBHOOK_SECRET` | From live webhook endpoint |
| `STRIPE_STARTER_PRICE_ID` | Live price ID |
| `STRIPE_GROWTH_PRICE_ID` | Live price ID |
| `STRIPE_SCALE_PRICE_ID` | Live price ID |
| `STRIPE_SUCCESS_URL` | `{APP_URL}/settings?tab=billing&checkout=success` |
| `STRIPE_CANCEL_URL` | `{APP_URL}/settings?tab=plans&checkout=cancel` |

Also confirm URL-aligned vars (Blueprint defaults in `render.yaml`):

| Variable | Must match |
|----------|------------|
| `APP_URL` | Public app origin |
| `BETTER_AUTH_URL` | Same origin as `APP_URL` |

### 2.2 Preflight (operator machine or Render Shell)

From `app/` with production env loaded (Render Shell recommended):

```bash
npm run preflight:stripe
```

Offline (format only, no Stripe API):

```bash
npm run preflight:stripe -- --offline
```

- [ ] All checks PASS before deploy.
- [ ] `stripe.mode` shows `live` when using production keys.

### 2.3 Deploy order

1. [ ] Set all `STRIPE_*` env vars in Render (no deploy yet).
2. [ ] Merge/release commit to `main` (auto-deploy) **or** manual deploy.
3. [ ] Wait for build + `npm run db:migrate` in start command to finish.
4. [ ] `GET {APP_URL}/api/health` → `200`.
5. [ ] Register/update Stripe webhook URL **after** deploy is live (URL must resolve).

## 3. Post-deploy smoke (operator)

Use a **dedicated operator account** — not a real customer.

### 3.1 Health and billing status

```bash
curl -sS "{APP_URL}/api/health"
```

- [ ] Authenticated session: Settings → Billing loads without error.
- [ ] `GET /api/billing/status` returns expected `access.kind` for operator workspace.

### 3.2 Checkout session (controlled)

1. [ ] Log in as operator → Settings → Plans → select **Starter** (or lowest tier).
2. [ ] Complete Checkout with a **real** payment method (live mode charges).
3. [ ] Redirect lands on `STRIPE_SUCCESS_URL` with `checkout=success`.
4. [ ] Stripe Dashboard shows Customer + Subscription in **live** mode.
5. [ ] App Billing tab shows `trialing` or `active` (14-day trial per `sessions.ts`).

### 3.3 Portal session

1. [ ] Settings → Billing → “Manage subscription” (portal).
2. [ ] Stripe Customer Portal opens and returns to `STRIPE_SUCCESS_URL` on exit.

### 3.4 Signed webhook smoke

See [`101-WEBHOOK-EVIDENCE.md`](./101-WEBHOOK-EVIDENCE.md) for the evidence template.

**Option A — Real checkout (preferred):** Steps 3.2–3.3 naturally emit `checkout.session.completed`, subscription events, and eventually `invoice.paid`.

**Option B — Stripe Dashboard “Send test webhook”:** Only valid if using **live** endpoint signing secret; prefer Option A for end-to-end proof.

Confirm in Stripe → Webhooks → endpoint → **Recent deliveries**:

- [ ] `checkout.session.completed` → `200`, response `{"received":true,...}`
- [ ] `customer.subscription.created` or `updated` → `200`
- [ ] `invoice.paid` → `200` (may arrive after trial ends or use test clock in test mode only)

Confirm in app:

- [ ] `billing_customers` row links operator `workspaceId` → `cus_...`
- [ ] `billing_subscriptions` status matches Stripe
- [ ] **Single** `credit_grants` row for first `invoice.paid` (`source=stripe_invoice`, `sourceId=invoice.id`)
- [ ] Re-delivering same `invoice.paid` event does **not** double-grant (idempotency)

Record event IDs and deploy SHA in `101-WEBHOOK-EVIDENCE.md`.

## 4. Rollback

If billing misconfiguration is detected post-deploy:

1. **Disable webhook** in Stripe Dashboard (stop processing bad events).
2. **Revert env vars** to previous test keys **or** remove `STRIPE_SECRET_KEY` to block new checkouts (app will fail env validation at boot — use only in emergency).
3. **Redeploy** previous known-good Render deploy from Events tab.
4. Document incident in `101-WEBHOOK-EVIDENCE.md` defects section.
5. For erroneous live charges: refund via Stripe Dashboard; do not delete customer records without DB review.

**Safe partial rollback:** Keep app running; swap `STRIPE_*` back to test keys only on a **staging** service — never mix test keys with live webhook endpoint.

## 5. Local dev / test mode (not production)

`npm run seed:stripe` wires a **test-mode** operator workspace with `tok_visa` — **never run against `sk_live_`**.

```bash
npm run seed:stripe -- --email=operator@example.com
```

Dry-run:

```bash
npm run seed:stripe -- --dry-run
```

Local webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

## 6. Sign-off

| Check | Status |
|-------|--------|
| Preflight PASS | ☐ |
| Live deploy healthy | ☐ |
| Checkout smoke (operator) | ☐ |
| Portal smoke | ☐ |
| Webhook evidence captured | ☐ |
| LIVE-01 satisfied | ☐ |
| LIVE-02 satisfied | ☐ |

Operator: _______________  Date (UTC): _______________
