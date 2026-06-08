# Pitfalls Research

**Domain:** Adding production Stripe billing to existing beta-first product
**Researched:** 2026-06-08
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Double credit grants

**What goes wrong:** User receives 2× monthly credits on first payment (checkout + invoice).

**How to avoid:** Grant only on `invoice.paid`; checkout handler only links customer/subscription.

**Phase:** 97 — Subscription Lifecycle Hardening

### Pitfall 2: Webhook replay without idempotency

**What goes wrong:** Duplicate grants or subscription rows on Stripe retries.

**How to avoid:** `hasProcessedStripeEvent` + unique `sourceId` on grants — verify in tests.

**Phase:** 97

### Pitfall 3: Test mode keys in production

**What goes wrong:** Real charges fail or test data in prod DB.

**How to avoid:** Go-live checklist; separate Vercel env groups; smoke with real R$0.50 price in test mode first.

**Phase:** 97 — Go-Live

### Pitfall 4: past_due silent lockout

**What goes wrong:** User with credits left but `past_due` sub sees "sem acesso" — support tickets.

**How to avoid:** Explicit `past_due` access kind; banner + portal; document grace policy (spend existing credits vs hard block).

**Phase:** 98 — Dunning & Access Policy

### Pitfall 5: Beta users hit paywall without explanation

**What goes wrong:** 10 ads exhausted → opaque 402.

**How to avoid:** Beta-specific copy + "Assinar com trial" CTA preserving workspace data.

**Phase:** 99 — Beta→Paid Conversion

## "Looks Done But Isn't" Checklist

- [ ] **Checkout:** Stripe Dashboard prices match `STRIPE_*_PRICE_ID` env vars
- [ ] **Webhook:** Production endpoint registered; `stripe listen` only for local
- [ ] **Trial:** First `invoice.paid` after trial still grants credits
- [ ] **Portal:** Returns null when no customer — UI handles empty state
- [ ] **402:** All generation routes use `spendCreditsOrApiError`

---
*Pitfalls research for: v12.0 Monetização Real*
*Researched: 2026-06-08*
