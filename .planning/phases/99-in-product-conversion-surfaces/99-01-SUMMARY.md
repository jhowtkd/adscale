---
phase: 99-in-product-conversion-surfaces
plan: 01
subsystem: payments
tags: [billing, conversion, 402, checkout, stripe, preview-gate, missions]

requires:
  - phase: 97-billing-contracts-subscription-lifecycle
    provides: normalized subscriptionStatus and billing status API
  - phase: 98-past-due-policy-recovery
    provides: past_due portal recovery metadata and hasSpendAccess policy
provides:
  - Structured 402 conversion payload with reason, recommendedAction, suggestedPlan, analytics
  - Preview/batch gate CTAs driven by conversion contract with campaign returnPath
  - Mission credit banner checkout/billing/portal actions at value moments
  - Checkout API returnPath forwarded to Stripe success/cancel URLs
affects: [100-billing-account-experience, 102-billing-regression-release-gate]

tech-stack:
  added: []
  patterns:
    - "Shared conversion-gate resolver for server 402 payloads and client proactive gates"
    - "ConversionCta component routes checkout, billing settings, or portal from contract"

key-files:
  created:
    - app/src/lib/billing/conversion-contract.ts
    - app/src/lib/billing/conversion-gate.ts
    - app/src/lib/billing/conversion-client.ts
    - app/src/server/billing/conversion.ts
    - app/src/components/billing/ConversionCta.tsx
    - app/src/lib/billing/conversion-gate.test.ts
    - app/src/lib/billing/conversion-contract.test.ts
  modified:
    - app/src/server/billing/gates.ts
    - app/src/server/billing/sessions.ts
    - app/src/app/api/billing/checkout/route.ts
    - app/src/lib/hooks/use-billing.ts
    - app/src/components/workspace/DerivationPreviewGateFooter.tsx
    - app/src/components/dashboard/MissionCreditBanner.tsx
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx

key-decisions:
  - "402 responses use conversion reason as top-level code with full payload in details"
  - "Beta exhaustion and insufficient credits route to checkout with campaign returnPath"
  - "Paid insufficient credits route to billing settings; past_due blocks route to portal"

patterns-established:
  - "resolveConversionGate mirrors server mapping for proactive UI before API 402"
  - "Analytics reasonCode preserved in payload.analytics for credit_blocked events"

requirements-completed: [CONV-01, CONV-02, CONV-03, CONV-04]

duration: 18min
completed: 2026-06-11
---

# Phase 99 Plan 01: In-Product Conversion Surfaces Summary

**Spend and entitlement blocks now return a typed conversion contract and render checkout, billing, or portal CTAs without losing campaign context.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-11T17:34:00Z
- **Completed:** 2026-06-11T17:52:00Z
- **Tasks:** 4 completed
- **Files modified:** 26

## Accomplishments

- All billing 402 responses from `spendCreditsOrApiError` emit a structured payload (`reason`, `recommendedAction`, optional `suggestedPlan`, `returnPath`, analytics fields).
- Preview gate shows localized conversion CTA when batch estimate exceeds balance; checkout preserves `/campaigns/:id?tab=generate&mode=preview` return path.
- Mission credit banner replaces dead-end billing link with actionable ConversionCta at value moments.
- Focused tests cover payload mapping, checkout returnPath, preview gate CTA, and mission upgrade flow.

## Task Commits

1. **Task 1: Define the conversion error contract** - `8c504d2a` (feat)
2. **Task 2: Wire preview and batch gates** - `f0e1f94c` (feat)
3. **Task 3: Connect existing value moments** - `4886eb52` (feat)
4. **Task 4: Add focused UI/API coverage** - `cd59d6cc` (test)

## Files Created/Modified

- `app/src/lib/billing/conversion-contract.ts` - Shared 402 payload types and parser
- `app/src/lib/billing/conversion-gate.ts` - Reason-to-action mapping for beta, paid, and past_due
- `app/src/server/billing/gates.ts` - Emits conversion payload on blocked spend
- `app/src/components/billing/ConversionCta.tsx` - Reusable checkout/billing/portal button
- `app/src/components/workspace/DerivationPreviewGateFooter.tsx` - Conversion CTA on insufficient batch
- `app/src/components/dashboard/MissionCreditBanner.tsx` - Upgrade moments wired to contract

## Deviations from Plan

None - plan executed as written.

## Verification

```bash
npm test -- src/lib/billing/conversion-gate.test.ts src/lib/billing/conversion-contract.test.ts src/server/billing/gates.test.ts src/server/billing/sessions.test.ts src/app/api/billing/checkout/route.test.ts src/lib/hooks/use-billing.test.tsx src/components/workspace/DerivationPreviewGateFooter.test.tsx src/components/dashboard/MissionPathCard.test.tsx
```

Result: 34 tests passed across 8 files.

## Self-Check: PASSED

- Key files exist on disk
- Commits `8c504d2a`, `f0e1f94c`, `4886eb52`, `cd59d6cc` present in git log
