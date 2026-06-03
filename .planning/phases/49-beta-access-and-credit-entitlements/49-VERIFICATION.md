# Phase 49: Beta Access and Credit Entitlements - Plan Verification

**Verified:** 2026-06-03
**Status:** Passed for planning

## Checks

- Roadmap includes Phase 49 and maps BET-01 through BET-05.
- Requirements include monetization coherence and beta tester access requirements.
- Context captures the user decision: beta testers need 10 generated ads.
- Research inspected live billing, credit, Stripe, schema, signup/onboarding, and derivation spend code.
- Plan avoids fake Stripe subscriptions and keeps beta enforcement server-side.
- Plan includes validation for active beta, exhausted beta, paid subscription, no active access, idempotency, UI status, and build.

## Coherence Decision

The current system should not sell or limit users by raw model tokens. It should keep provider token costs as internal pricing assumptions and expose app entitlements as credits/generated ads. For beta testers, the executable design is:

- 10 generated ads as the user-facing cap.
- 50 internal credits if `image_derivation` remains 5 credits.
- Separate beta entitlement/access record.
- Normal credit grant debit through the existing spend gate.
- No fake Stripe subscription rows.

## Remaining Product Choice

Execution can choose the lowest-blast-radius beta redemption UX:

- Signup/onboarding beta code field.
- Invite-style beta redemption link.
- Seeded owner/admin script for the first closed beta.

Any option must end in the same server-side entitlement plus 50-credit grant.
