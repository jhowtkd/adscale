---
phase: 76-cockpit-and-mission-instrumentation
plan: 04
subsystem: testing
tags: [vitest, beta-analytics, integration-tests, QA-01, INST-04]

requires:
  - phase: 76-cockpit-and-mission-instrumentation
    provides: recordBetaAnalyticsEvent server/client instrumentation from plans 76-02 and 76-03
provides:
  - QA-01 integration coverage for readiness and mission completion paths
  - INST-04 smoke tests for session_id attachment via beta_sessions fixture
affects:
  - phase-77-operator-sessions
  - phase-76-verification

tech-stack:
  added: []
  patterns:
    - "Integration scenarios named for QA paths with mocked insert + getBetaSessionById"
    - "Repository-level sessionId insert/list filter verification"

key-files:
  created:
    - app/src/server/beta-analytics/instrumentation.integration.test.ts
  modified:
    - app/src/server/repositories/beta-analytics.test.ts

key-decisions:
  - "Kept integration file focused on record + repository contract; route coverage remains in 76-02 tests"
  - "INST-04 smoke uses mocked beta_sessions fixture per D-04; no operator session APIs until Phase 77"

patterns-established:
  - "QA-01 describe blocks: readiness block/complete, mission export/share, client cockpit_stage_completed"
  - "INST-04 smoke describe: session fixture attach + cross-workspace rejection"

requirements-completed: [QA-01, INST-04]

duration: 5min
completed: 2026-06-07
---

# Phase 76 Plan 04: Integration Tests / Smoke Summary

**End-to-end integration tests proving readiness, mission completion, and session_id grouping through recordBetaAnalyticsEvent**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-07T10:18:00Z
- **Completed:** 2026-06-07T10:23:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- QA-01: `readiness_blocked` / `readiness_completed` integration scenarios with server source and sanitization contract
- QA-01: `mission_completed` export/share server paths plus `cockpit_stage_completed` client preview path
- INST-04: Session_id attachment smoke with beta_sessions fixture mock and cross-workspace rejection
- Repository tests for sessionId insert persistence and listBetaAnalyticsEvents sessionId filter

## Task Commits

Each task was committed atomically:

1. **Task 1: Readiness path integration test** - `2fd90e85` (test)
2. **Task 2: Mission completion path integration test** - `df5621a7` (test)
3. **Task 3: beta_session session_id attachment smoke test** - `a1301a87` (test)

## Files Created/Modified

- `app/src/server/beta-analytics/instrumentation.integration.test.ts` - QA-01 + INST-04 integration scenarios (8 tests)
- `app/src/server/repositories/beta-analytics.test.ts` - sessionId insert + list filter coverage (+2 tests)

## Decisions Made

- Integration file exercises `recordBetaAnalyticsEvent` contract directly; preflight/export route tests from 76-02 remain the route-level proof
- No duplication of full route handler tests per plan guidance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 76 complete (4/4 plans); ready for Phase 77 operator session APIs
- Manual DB smoke optional per 76-VALIDATION.md before first operator session

## Self-Check: PASSED

- FOUND: app/src/server/beta-analytics/instrumentation.integration.test.ts
- FOUND: app/src/server/repositories/beta-analytics.test.ts (extended)
- FOUND: 2fd90e85
- FOUND: df5621a7
- FOUND: a1301a87
- Phase command: 20 files, 137 tests passed
- Lint: 0 errors

---
*Phase: 76-cockpit-and-mission-instrumentation*
*Completed: 2026-06-07*
