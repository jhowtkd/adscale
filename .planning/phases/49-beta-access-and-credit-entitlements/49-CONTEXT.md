# Phase 49: Beta Access and Credit Entitlements - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Source:** User request + live repo inspection

<domain>
## Phase Boundary

This phase decides and implements the monetization/access foundation needed before external user testing. It should answer whether the current token/credit system is coherent and revise it where needed, then add a beta tester access path with a hard limit of 10 generated ads.

The phase does not need to ship a full pricing experiment, coupon system, affiliate/referral flow, or public admin console.
</domain>

<decisions>
## Implementation Decisions

### Monetization Semantics
- Locked: Raw provider tokens are internal cost inputs, not the unit shown to app users.
- Locked: User-facing limits should be expressed as generated ads/credits.
- Locked: A generated ad output is the beta entitlement unit.
- Locked: Keep the existing credit spend gate instead of adding a parallel generation limiter.

### Beta Access
- Locked: Beta testers need app access without Stripe checkout.
- Locked: Beta testers get a limit of 10 generated ads.
- Locked: Do not create fake Stripe subscriptions or fake Stripe customer IDs for beta access.
- Locked: Beta exhaustion should use the same 402/payment-required API shape as paid credit exhaustion so client handling remains consistent.

### Product Surface
- Locked: Billing/settings should distinguish beta access from paid subscription status.
- Locked: The UI should show remaining beta ads in plain language.
- Claude's Discretion: Exact beta redemption mechanism, as long as it is practical for the owner to distribute and server-enforced.

</decisions>

<specifics>
## Specific Ideas

- Current `CREDIT_COSTS.image_derivation` is 5, and the derivations route already charges `jobsToCreate.length * 5`.
- Current `Trial` and `Starter` plans grant 30 credits and describe that as 6 images.
- OpenAI GPT-Image-2 pricing as of 2026-06-03 is token-based for text/image input and image output, which supports keeping token math as an internal cost forecast only.
- A clean beta grant can be represented as 50 internal credits if the system keeps `5 credits = 1 generated ad`, but the UI should render that as 10 beta ads.
</specifics>

<deferred>
## Deferred Ideas

- Public pricing A/B tests.
- Full admin dashboard for beta cohort management.
- Stripe coupons/promotion codes as the beta mechanism.
- Changing every paid plan from credits to ad-count packages.
- Hard COGS margin analytics beyond the current forecast calculator.

</deferred>

---

*Phase: 49-beta-access-and-credit-entitlements*
*Context gathered: 2026-06-03*
