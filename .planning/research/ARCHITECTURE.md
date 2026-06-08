# Architecture Research

**Domain:** Billing integration in existing Next.js monolith
**Researched:** 2026-06-08
**Confidence:** HIGH

## System Overview

```
┌──────────────── Client (BillingTab, 402 surfaces, missions) ────────────┐
│  useBillingStatus / useStartCheckout / useBillingPortal               │
└────────────────────────────┬──────────────────────────────────────────┘
                             │ API
┌────────────────────────────▼──────────────────────────────────────────┐
│  /api/billing/checkout | portal | status | webhook | beta/redeem      │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────────────┐
│  server/billing: access.ts, credits.ts, events.ts, gates.ts, sessions │
└──────────────┬─────────────────────────────┬──────────────────────────┘
               │                             │
        ┌──────▼──────┐               ┌──────▼──────┐
        │  Stripe API │               │  Postgres   │
        │  (external) │               │ subscriptions│
        └─────────────┘               │ credit_grants│
                                      │ beta_entitle │
                                      └─────────────┘
```

## Integration Points (v12 changes)

| Boundary | Current | v12 change |
|----------|---------|------------|
| `getWorkspaceBillingAccess` | `active`/`trialing` = paid | Expose `past_due`/`canceled` labels; optional grace spend policy |
| `spendCreditsOrApiError` | 402 with reason | Include `upgradeUrl` or `checkoutPlanKey` in payload |
| Webhook `invoice.paid` | Grants credits | Verify idempotency on `sourceId=invoice.id` (likely exists) |
| Beta exhaustion | Same 402 shape | Add `suggestedAction: subscribe` in client |

## Recommended Build Order

1. **Access model clarity** — subscription status enum → UI + gates (foundation)
2. **Go-live ops** — env, webhook URL, Stripe Dashboard products/prices
3. **Conversion surfaces** — 402 handlers, preview gate, beta exhaustion
4. **Billing UI polish** — history endpoint consumption, past_due banner
5. **Regression** — webhook fixtures, TestSprite billing paths

## Anti-Patterns

- **Grant credits on `checkout.session.completed`** — double-grant with `invoice.paid`; current code only upserts sub on checkout ✓
- **Blocking spend on `past_due` without messaging** — user sees generic "sem acesso"; need portal CTA
- **Checkout from webhook** — all checkout must be user-initiated sessions

---
*Architecture research for: v12.0 Monetização Real*
*Researched: 2026-06-08*
