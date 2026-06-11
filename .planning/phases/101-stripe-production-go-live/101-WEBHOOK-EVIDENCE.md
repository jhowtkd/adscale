# Live Webhook Evidence — Phase 101

**Local only until operator completes smoke — redact before any public share.**

Copy this template when executing production webhook smoke (runbook §3.4).  
**Do not commit** rows filled with live customer emails, full payment details, or secret values.

## Metadata

| Field | Value |
|-------|-------|
| Deploy SHA | `_(from Render Events or `git rev-parse HEAD`)_` |
| Render deploy ID | `_(e.g. dep-...) _ ` |
| Date (UTC) | |
| Operator | |
| Stripe mode | `live` |
| `APP_URL` | |
| Webhook endpoint ID | `we_...` _(Stripe Dashboard)_ |
| Operator workspace ID | `_(app UUID, not customer PII)_` |

## Env inventory (names only — values in Render)

| Variable | Set | Mode check |
|----------|-----|------------|
| `STRIPE_SECRET_KEY` | ☐ | `sk_live_` or `rk_live_` |
| `STRIPE_WEBHOOK_SECRET` | ☐ | `whsec_` |
| `STRIPE_STARTER_PRICE_ID` | ☐ | `price_` livemode |
| `STRIPE_GROWTH_PRICE_ID` | ☐ | `price_` livemode |
| `STRIPE_SCALE_PRICE_ID` | ☐ | `price_` livemode |
| `STRIPE_SUCCESS_URL` | ☐ | matches `APP_URL` origin |
| `STRIPE_CANCEL_URL` | ☐ | matches `APP_URL` origin |

## Preflight output (sanitized)

```
_(paste `npm run preflight:stripe` summary — secrets already masked by script)_
```

## Stripe webhook deliveries

| Event type | Event ID (`evt_...`) | HTTP | App result | Notes |
|------------|----------------------|------|------------|-------|
| `checkout.session.completed` | | ☐ 200 | `received: true` | |
| `customer.subscription.created` | | ☐ 200 | | |
| `customer.subscription.updated` | | ☐ 200 | | |
| `invoice.paid` | | ☐ 200 | grant created | |
| `invoice.payment_failed` | | n/a / ☐ | skipped or past_due | optional negative test |

## Application state (redacted)

| Artifact | Expected | Observed |
|----------|----------|----------|
| Stripe Customer ID | `cus_...` | |
| Subscription ID | `sub_...` | |
| Subscription status | `trialing` or `active` | |
| Invoice ID (first grant) | `in_...` | |
| Credit grant `source` | `stripe_invoice` | |
| Credit grant `sourceId` | matches invoice ID | |
| Duplicate `invoice.paid` redelivery | no second grant | ☐ verified |

## Checkout / portal smoke

| Step | Pass | Notes |
|------|------|-------|
| Checkout session created (`POST /api/billing/checkout`) | ☐ | |
| Checkout completed in browser | ☐ | |
| Portal session opened | ☐ | |
| Billing tab status matches Stripe | ☐ | |

## Defects

_(none / describe)_

## Sign-off

| | |
|-|-|
| LIVE-02 webhook signature + processing | ☐ PASS ☐ FAIL |
| Idempotent `invoice.paid` grant | ☐ PASS ☐ FAIL |
| Operator signature | |
| Next action | |
