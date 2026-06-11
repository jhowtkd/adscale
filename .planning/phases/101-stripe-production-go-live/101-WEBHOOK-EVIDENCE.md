# Live Webhook Evidence — Phase 101

**Status:** Partial — signature + delivery verified; grant idempotency pending operator checkout  
**Date (UTC):** 2026-06-11  
**Operator:** Cursor agent (automated smoke) + pending human checkout sign-off

## Metadata

| Field | Value |
|-------|-------|
| Deploy SHA | `8522023a5daf8c432e110dd18882a9560c383d41` |
| Render deploy ID | `dep-d8lfm4jbc2fs73d2qni0` |
| Date (UTC) | 2026-06-11T18:14–18:21Z |
| Operator | automated smoke (Render CLI + Stripe CLI) |
| Stripe mode | `test` (webhook endpoint `livemode: false`) |
| `APP_URL` | `https://adscale.jhonatansoares.com` |
| Webhook endpoint ID | `we_1ThD7eF6fTsFq3PUr4jhTGCK` |
| Operator workspace ID | _(pending — requires prod login + Starter checkout)_ |

> **Note:** Production app URL serves live traffic. Stripe keys on Render remain **test mode** for this smoke (`sk_test_*`). LIVE-02 signature + routing proof is captured below; full `invoice.paid` grant idempotency requires one operator checkout against a workspace that exists in **production** Postgres.

## Env inventory (names only — values in Render)

| Variable | Set | Mode check |
|----------|-----|------------|
| `STRIPE_SECRET_KEY` | ☑ | test (Render; preflight not run in shell) |
| `STRIPE_WEBHOOK_SECRET` | ☑ | updated 2026-06-11 for endpoint `we_1ThD7e…` |
| `STRIPE_STARTER_PRICE_ID` | ☑ | `price_*` |
| `STRIPE_GROWTH_PRICE_ID` | ☑ | `price_*` |
| `STRIPE_SCALE_PRICE_ID` | ☑ | `price_*` |
| `STRIPE_SUCCESS_URL` | ☑ | `https://adscale.jhonatansoares.com/settings?tab=billing&checkout=success` |
| `STRIPE_CANCEL_URL` | ☑ | `https://adscale.jhonatansoares.com/settings?tab=plans&checkout=cancel` |

## Preflight output (sanitized)

Not run inside Render Shell (non-interactive). Local offline preflight: **16/16 PASS** (test keys).

Production health:

```
GET https://adscale.jhonatansoares.com/api/health → 200
{"ok":true,"service":"adscale-app",...}
```

Webhook route (unsigned POST):

```
POST https://adscale.jhonatansoares.com/api/billing/webhook → 400 (stripeSignatureMissing)
```

## Stripe webhook deliveries

| Event type | Event ID | HTTP | App result | Notes |
|------------|----------|------|------------|-------|
| `checkout.session.completed` | `evt_1TZ71nF6fTsFq3PU6m5tUyef` | signed → handler | 500 | Signature OK; DB FK — workspace not in prod DB |
| `checkout.session.completed` | _(stripe trigger fixtures)_ | signed → handler | 500 | `Missing checkout session billing metadata` (expected for CLI fixtures) |
| `customer.subscription.*` | _(stripe trigger)_ | signed → handler | 500 | `Missing subscription billing metadata` |
| `invoice.paid` | `evt_1ThDCxF6fTsFq3PUVx2Ehsz0` | signed → handler | 500 | `Missing invoice subscription` (fixture invoice shape) |
| `invoice.payment_failed` | _(stripe trigger)_ | signed → handler | 500 | fixture metadata |

**Signature verification:** CONFIRMED — events reach `processStripeEvent` (Render logs `billing.webhook.POST`, not `stripeSignatureInvalid`).

## Application state (redacted)

| Artifact | Expected | Observed |
|----------|----------|----------|
| Stripe Customer ID | `cus_...` | not persisted (checkout handler 500) |
| Subscription ID | `sub_...` | not persisted |
| Credit grant `source=stripe_invoice` | single grant | not observed (no successful `invoice.paid` on prod DB) |
| Duplicate `invoice.paid` redelivery | no second grant | ☐ pending operator checkout |

## Checkout / portal smoke

| Step | Pass | Notes |
|------|------|-------|
| Production deploy healthy | ☑ | `dep-d8lfm4jbc2fs73d2qni0` live |
| Checkout session (browser) | ☐ | **Operator:** login → Settings → Plans → Starter |
| Portal session | ☐ | after checkout |
| Billing tab status matches Stripe | ☐ | after checkout |

## Defects

- `stripe trigger` fixtures lack `workspaceId`/`planKey` metadata — expected; not a production bug.
- Resend of real checkout event `evt_1TZ71n…` failed `billing_customers` insert — workspace UUID not present in production Postgres.
- **Remediation:** operator completes checkout while logged into production app (creates session metadata + valid workspace FK).

## Sign-off

| | |
|-|-|
| LIVE-02 webhook signature + routing | ☑ PASS |
| LIVE-02 event processing (error-free) | ☐ FAIL — pending operator checkout |
| Idempotent `invoice.paid` grant | ☐ pending |
| Operator signature | _(pending)_ |
| Next action | Log into prod → Starter checkout → re-deliver `invoice.paid` → verify single grant |
