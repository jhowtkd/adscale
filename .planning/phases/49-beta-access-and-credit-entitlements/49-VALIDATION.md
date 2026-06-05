# Phase 49: Beta Access and Credit Entitlements - Validation Strategy

**Created:** 2026-06-03
**Status:** Ready

## Validation Architecture

This phase must prove both entitlement correctness and product-language coherence.

## Required Checks

1. `canSpend` allows beta tester workspaces without Stripe when enough beta credits remain.
2. `canSpend` blocks beta tester workspaces after 10 generated ads worth of credits are exhausted.
3. Existing paid subscriptions still work unchanged.
4. Duplicate idempotency keys do not double-debit beta grants.
5. Billing status returns a distinct beta access shape, not a fake subscription.
6. Settings/plans UI renders beta access and remaining ads without exposing raw provider tokens as the user-facing limit.
7. `npm run build` passes from `app`.

## Evidence Required

- Focused unit/route test command output.
- Build output.
- Manual or scripted local smoke showing beta status and exhausted access behavior.
