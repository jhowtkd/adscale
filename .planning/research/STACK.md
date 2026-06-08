# Stack Research

**Domain:** SaaS subscription billing (B2B creative tooling)
**Researched:** 2026-06-08
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Stripe Node SDK | latest (API 2026-04-22.dahlia) | Subscriptions, Checkout, webhooks | Already integrated; Checkout Sessions + Billing APIs are Stripe's recommended path for recurring SaaS |
| Stripe Checkout Sessions | — | Hosted checkout + trial | Avoids PCI scope; supports `trial_period_days`, promotion codes, BRL prices |
| Stripe Customer Portal | — | Self-serve plan/payment management | Already wired via `createPortalSession` |
| Existing ADScale credit ledger | Drizzle + Postgres | Spend gates independent of Stripe | Decouples generation metering from billing events — correct for usage-based credits on subscription |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `stripe` npm package | ^18+ | Server SDK | All server routes (`checkout`, `webhook`, `portal`) |
| Webhook signature verify | built-in | `constructEvent` | Every production webhook — non-negotiable |
| Restricted API keys (RAK) | Dashboard | Prod deploy | Prefer `rk_` over full `sk_` with least privilege |

### What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Payment Element for v12 | Duplicates Checkout; more PCI/UX work | Keep Checkout Sessions |
| Fake Stripe subs for beta | v11.2 decision locked | Beta entitlements table |
| `payment_method_types` on Checkout | Blocks dynamic payment methods | Dashboard payment method config |
| Second credit system | Phase 49 locked semantics | Existing `credit_grants` + `recordUsage` |

## Version Compatibility

| Package | Notes |
|---------|-------|
| `stripe@` in `app/package.json` | Pin and test against Stripe API version in Dashboard |
| Invoice object shape | `events.ts` already handles legacy + 2026 invoice subscription ID paths |

## Sources

- ADScale `app/src/server/billing/*` — existing integration
- Stripe best practices skill — Checkout for subscriptions, RAK for prod
- Phase 49 CONTEXT — beta vs paid semantics locked

---
*Stack research for: v12.0 Monetização Real*
*Researched: 2026-06-08*
