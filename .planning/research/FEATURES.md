# Feature Research

**Domain:** SaaS monetization for AI creative generation product
**Researched:** 2026-06-08
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Subscribe with card + trial | Standard SaaS onboarding | LOW | Already: 14d trial in `sessions.ts` |
| See plan, credits remaining, renewal | Transparency before spend | LOW | Partial in `BillingTab` |
| Upgrade when blocked | 402 without path = churn | MEDIUM | Gates exist; CTAs incomplete outside settings |
| Manage subscription (cancel, update card) | Self-serve | LOW | Portal route exists |
| Monthly credit refresh on payment | Value delivery | LOW | `invoice.paid` → `createCreditGrant` exists |
| Clear beta vs paid status | Trust | LOW | `access.kind` exists |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Credit estimate before batch (v11.9) | Reduces surprise | — | Already shipped — tie to upgrade CTA |
| Ads-as-unit language (10 beta ads) | Non-technical buyers | LOW | Keep credits internal |
| Value-moment upgrade (v11.7) | Ethical conversion | MEDIUM | Wire to checkout from mission/cockpit blocks |

### Anti-Features

| Feature | Why Problematic | Alternative |
|---------|-----------------|-------------|
| Usage-based metering per API token in UI | Confuses buyers (Phase 49) | Internal forecast only |
| Coupon-driven beta | Ops complexity | Env-based beta codes |
| Annual plans in v12 | Pricing validation needed | Defer to v12.1 |
| Top-up packs without subscription | Stripe product sprawl | Defer |

## MVP Definition (v12.0 Launch)

- [ ] Production Stripe go-live checklist + smoke test
- [ ] Subscription lifecycle hardened (trial → active → past_due → canceled)
- [ ] In-product upgrade from 402 surfaces
- [ ] Billing UI: status badges, portal, grant history
- [ ] Beta path preserved with exhaustion → paid CTA
- [ ] Webhook + access regression tests

### Defer (v12.1+)

- Annual billing, credit top-ups, admin cohort dashboard, Stripe Tax, dunning emails via Resend

## Feature Prioritization Matrix

| Feature | User Value | Cost | Priority |
|---------|------------|------|----------|
| Go-live + webhook prod | HIGH | LOW | P1 |
| 402 → checkout CTA | HIGH | MEDIUM | P1 |
| past_due UX + spend block | HIGH | LOW | P1 |
| Grant/invoice history UI | MEDIUM | MEDIUM | P2 |
| Plan change (upgrade tier) | MEDIUM | MEDIUM | P2 |
| Dunning email | MEDIUM | HIGH | P3 |

---
*Feature research for: v12.0 Monetização Real*
*Researched: 2026-06-08*
