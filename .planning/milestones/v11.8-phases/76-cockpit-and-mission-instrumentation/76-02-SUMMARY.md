---
phase: 76-cockpit-and-mission-instrumentation
plan: 02
subsystem: api
tags: [beta-analytics, server-instrumentation, billing, readiness, mission-completed, vitest]

requires:
  - phase: 76-cockpit-and-mission-instrumentation
    provides: PHASE_76_BETA_EVENT_KEYS, getBetaSessionIdFromRequest, recordBetaAnalyticsEvent
provides:
  - Preflight readiness_blocked/readiness_completed and route-level credit_blocked
  - credit_spend and credit_blocked from recordUsage when userId present
  - mission_completed at export, share, and derivation-approve boundaries
affects:
  - 76-03 client cockpit instrumentation
  - 76-04 integration smoke tests
  - Phase 78 owner funnel aggregation

tech-stack:
  added: []
  patterns:
    - "Fire-and-forget server analytics with try/catch; never block API responses"
    - "Single credit analytics emission point in recordUsage (gates stays thin)"
    - "mission_completed at durable evidence writes only (not inferMissionCompletions)"

key-files:
  created:
    - app/src/app/api/exports/route.test.ts
    - app/src/app/api/share/route.test.ts
  modified:
    - app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts
    - app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.test.ts
    - app/src/server/billing/credits.ts
    - app/src/server/billing/credits.test.ts
    - app/src/server/billing/gates.test.ts
    - app/src/app/api/exports/route.ts
    - app/src/app/api/share/route.ts
    - app/src/app/api/derivations/[id]/review/route.ts
    - app/src/app/api/derivations/[id]/review/route.test.ts

key-decisions:
  - "credit_blocked at preflight route when gates return 402 (no userId on spendCredits to avoid double-emit with recordUsage)"
  - "credit_spend/credit_blocked only in recordUsage when userId provided; gates forwards userId"
  - "mission_completed approve-only on derivation review PATCH"

patterns-established:
  - "Server instrumentation: source server, sessionId from x-beta-session-id via getBetaSessionIdFromRequest"
  - "Readiness events include blockingCount, readinessStatus, stage/missionKey readiness"

requirements-completed: [INST-02, INST-04]

duration: 10min
completed: 2026-06-07
---

# Phase 76 Plan 02: Server Instrumentation Summary

**Authoritative server beta analytics at preflight readiness, billing credit boundaries, and export/share/review mission completion**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-07T15:13:00Z
- **Completed:** 2026-06-07T15:23:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Preflight POST emits `readiness_blocked` / `readiness_completed` on cached and fresh paths plus `credit_blocked` on 402
- `recordUsage` emits `credit_spend` on success and `credit_blocked` on block when `userId` is set
- Export, share, and derivation-approve routes emit `mission_completed` with correct `missionKey`
- All server emissions use `source: "server"` and forward optional `sessionId` from header

## Task Commits

1. **Task 1: Preflight readiness and credit-block instrumentation** - `831680d1` (feat)
2. **Task 2: Credit spend and gate-block instrumentation** - `598da24a` (feat)
3. **Task 3: mission_completed at durable evidence boundaries** - `6dcdd386` (feat)

## Files Created/Modified

- `app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts` - readiness + credit_blocked analytics
- `app/src/server/billing/credits.ts` - credit_spend/credit_blocked in recordUsage
- `app/src/app/api/exports/route.ts` - mission_completed on export success
- `app/src/app/api/share/route.ts` - mission_completed on share token creation
- `app/src/app/api/derivations/[id]/review/route.ts` - mission_completed on approve only
- Route and billing test files - mock recordBetaAnalyticsEvent assertions

## Decisions Made

- Preflight emits `credit_blocked` at route level (gates call lacks userId); billing layer handles credit events when routes pass `userId`
- `betaSessionId` in recordUsage metadata maps to analytics `sessionId` for billing events
- Rejected review does not emit `mission_completed` per D-02 discretion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All five server event types wired at authoritative paths; ready for 76-03 client cockpit hooks and 76-04 smoke integration
- Routes calling `spendCreditsOrApiError` can pass `userId` + `metadata.betaSessionId` for billing analytics when desired

## Self-Check: PASSED

- FOUND: app/src/app/api/exports/route.test.ts
- FOUND: app/src/app/api/share/route.test.ts
- FOUND: 831680d1
- FOUND: 598da24a
- FOUND: 6dcdd386

---
*Phase: 76-cockpit-and-mission-instrumentation*
*Completed: 2026-06-07*
