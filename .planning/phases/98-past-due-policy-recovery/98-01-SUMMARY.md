---
phase: 98-past-due-policy-recovery
plan: 01
subsystem: payments
tags: [stripe, billing, past_due, dunning, portal, credits]

requires:
  - phase: 97-billing-contracts-subscription-lifecycle
    provides: normalized subscriptionStatus, latest subscription fetch, idempotent invoice grants
provides:
  - Documented past_due spend policy with existing-credits spendable behavior
  - pastDue recovery metadata on /api/billing/status with portal action
  - BillingTab past_due banner and portal CTA
  - Suspended invoice.paid grants while subscription is past_due
affects: [99-conversion-surfaces, 100-billing-account-experience, 102-billing-regression-release-gate]

tech-stack:
  added: []
  patterns:
    - "Past-due spend resolved via hasSpendAccess when latest subscription is past_due and credits remain"
    - "invoice.paid grants gated on active/trialing subscription status only"

key-files:
  created:
    - app/src/components/settings/BillingTab.test.tsx
  modified:
    - app/src/server/billing/access.ts
    - app/src/server/billing/events.ts
    - app/src/app/api/billing/status/route.ts
    - app/src/lib/hooks/use-billing.ts
    - app/src/components/settings/BillingTab.tsx
    - app/src/server/billing/access.test.ts
    - app/src/server/billing/credits.test.ts
    - app/src/server/billing/events.test.ts
    - app/src/server/billing/gates.test.ts
    - app/src/app/api/billing/status/route.test.ts
    - app/src/lib/hooks/use-billing.test.tsx

key-decisions:
  - "Existing credit balance remains spendable during past_due; label is Pagamento pendente instead of Sem acesso ativo"
  - "invoice.paid skips createCreditGrant unless subscription status is active or trialing"
  - "pastDue.recoveryAction portal metadata exposed whenever subscriptionStatus is past_due"

patterns-established:
  - "PAST_DUE_SPEND_POLICY constant documents server policy for API consumers"
  - "Billing UI reads hasSpendAccess from API instead of inferring only from active/trialing"

requirements-completed: [DUEN-01, DUEN-02, DUEN-03]

duration: 12min
completed: 2026-06-11
---

# Phase 98 Plan 01: Past-Due Policy and Recovery Summary

**Past-due workspaces can spend remaining credits, see a portal recovery path, and no longer receive monthly grants until payment recovers.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-11T17:44:00Z
- **Completed:** 2026-06-11T17:48:00Z
- **Tasks:** 3 completed
- **Files modified:** 12

## Accomplishments

- Documented and enforced DUEN-01: `past_due` workspaces with remaining credits get `hasSpendAccess: true` and label "Pagamento pendente".
- `/api/billing/status` returns `pastDue: { recoveryAction: "portal", spendPolicy: "existing_credits_spendable" }` plus `access.hasSpendAccess`.
- BillingTab shows an amber past_due banner with one-click Customer Portal recovery; status line no longer collapses to generic inactive copy.
- `invoice.paid` no longer creates credit grants while subscription status is `past_due`.

## Task Commits

1. **Task 1: Lock the policy** - `f8935c75` (feat)
2. **Task 2: Expose recovery state** - `b3e14d17` (feat)
3. **Task 3: Cover failure and recovery** - `b8ff55b3` (test)

## Files Created/Modified

- `app/src/server/billing/access.ts` - Past-due policy constants and spend access branch
- `app/src/server/billing/events.ts` - Grant suspension for non-active subscriptions on invoice.paid
- `app/src/app/api/billing/status/route.ts` - pastDue metadata and hasSpendAccess on access payload
- `app/src/lib/hooks/use-billing.ts` - Typed pastDue and hasSpendAccess fields
- `app/src/components/settings/BillingTab.tsx` - Past-due banner, portal CTA, status copy
- `app/src/components/settings/BillingTab.test.tsx` - Banner and portal interaction tests
- Test suites updated across access, credits, events, gates, status route, and billing hooks

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/src/server/billing/access.ts
- FOUND: app/src/components/settings/BillingTab.test.tsx
- FOUND: f8935c75, b3e14d17, b8ff55b3
