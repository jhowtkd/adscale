---
phase: 97-billing-contracts-subscription-lifecycle
plan: 01
subsystem: payments
tags: [stripe, billing, subscription, idempotency, credits]

requires:
  - phase: existing-stripe-stack
    provides: checkout, portal, webhook, billing repositories
provides:
  - Normalized subscriptionStatus on /api/billing/status independent from access.kind
  - invoice.paid credit grants idempotent by stripe_invoice + invoice.id sourceId
  - checkout.session.completed limited to customer/subscription sync without credit grants
affects: [98-past-due-policy, 99-conversion-surfaces, 100-billing-account-experience]

tech-stack:
  added: []
  patterns:
    - "Latest subscription record fetched separately from active spend subscription"
    - "Grant-level idempotency on stripe_invoice sourceId before createCreditGrant"

key-files:
  created: []
  modified:
    - app/src/server/repositories/billing.ts
    - app/src/server/billing/access.ts
    - app/src/server/billing/events.ts
    - app/src/app/api/billing/status/route.ts
    - app/src/lib/hooks/use-billing.ts
    - app/src/server/billing/access.test.ts
    - app/src/server/billing/events.test.ts
    - app/src/app/api/billing/status/route.test.ts

key-decisions:
  - "Map checkout_completed to trialing as transitional normalized status until Stripe subscription sync arrives"
  - "Keep beta spend access independent; expose past_due/canceled via latestSubscription even when access.kind is beta or none"
  - "Use application-level grant lookup by source+sourceId rather than schema migration for invoice idempotency"

patterns-established:
  - "SubscriptionStatus enum (trialing|active|past_due|canceled|none) normalized from raw Stripe/DB status"
  - "Dual subscription fetch: active for spend access, latest for observable billing state"

requirements-completed: [SUBS-01, SUBS-02, SUBS-03]

duration: 3min
completed: 2026-06-11
---

# Phase 97 Plan 01: Billing Contracts and Subscription Lifecycle Summary

**Normalized subscription status and idempotent invoice credit grants before conversion UI depends on billing state.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-11T17:37:59Z
- **Completed:** 2026-06-11T17:40:13Z
- **Tasks:** 3 completed
- **Files modified:** 8

## Accomplishments

- `/api/billing/status` now returns `subscriptionStatus` independently from `access.kind`, with subscription details sourced from the latest workspace record (including `past_due` and `canceled`).
- `invoice.paid` skips duplicate grants when a `stripe_invoice` grant already exists for the Stripe `invoice.id`.
- `checkout.session.completed` continues to link customer/subscription only; tests assert it never calls `createCreditGrant`.
- Beta access remains parallel to paid subscription records; past_due subscriptions are observable while beta spend access continues.

## Task Commits

1. **Task 1: Normalize billing status** - `fbd2b347` (feat)
2. **Task 2: Harden Stripe lifecycle processing** - `e7b9f28e` (feat)
3. **Task 3: Verify contracts** - `6b0383e5` (test)

## Files Created/Modified

- `app/src/server/repositories/billing.ts` - Added `getLatestSubscriptionByWorkspace` and `getCreditGrantBySourceId`
- `app/src/server/billing/access.ts` - Added `SubscriptionStatus`, `normalizeSubscriptionStatus`, dual subscription fetch
- `app/src/server/billing/events.ts` - Invoice grant idempotency guard on `invoice.id`
- `app/src/app/api/billing/status/route.ts` - Exposes `subscriptionStatus` and latest subscription details
- `app/src/lib/hooks/use-billing.ts` - Typed `subscriptionStatus` and `rawStatus` on subscription payload
- Test files for access, events, and status route

## Deviations from Plan

None - plan executed exactly as written.

## Verification

```bash
npm test -- src/server/billing/events.test.ts src/server/billing/access.test.ts src/app/api/billing/status/route.test.ts
```

Result: 25 tests passed across 3 files.

## Self-Check: PASSED

- All key modified files exist on disk
- Commits `fbd2b347`, `e7b9f28e`, `6b0383e5` present in git log
