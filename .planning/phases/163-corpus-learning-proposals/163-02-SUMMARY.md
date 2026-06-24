---
phase: 163-corpus-learning-proposals
plan: "02"
subsystem: api
tags: [corpus-learning, factual-alerts, fixture-ack, vitest, human-quality]

requires:
  - phase: 163-01
    provides: evidenceRefs with artifactIds and fixtureOnly in aggregate
provides:
  - buildLearningSliceBuckets shared slice bucketing
  - buildFactualIssueAlerts and owner GET factual-alerts API
  - fixture_ack_required gate on proposal accept with fixture_only_corpus caveat
affects:
  - 163-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Factual_issue slices surface as computed alerts, never client_learning_proposals"
    - "Fixture-only accept requires explicit acknowledgeFixtureOnly in POST body"

key-files:
  created:
    - app/src/server/human-quality/learning/factual-alerts.ts
    - app/src/app/api/admin/quality/learning/factual-alerts/route.ts
    - app/tests/unit/human-quality/learning/factual-alerts.test.ts
    - app/src/app/api/admin/quality/learning/factual-alerts/route.test.ts
  modified:
    - app/src/server/human-quality/learning/aggregate.ts
    - app/src/server/human-quality/calibration/types.ts
    - app/src/server/human-quality/learning/proposals.ts
    - app/src/app/api/admin/quality/learning/proposals/[id]/accept/route.ts
    - app/src/server/jobs/learning-proposal-aggregator.ts

key-decisions:
  - "Extract buildLearningSliceBuckets for shared threshold logic between proposals and factual alerts"
  - "Factual alerts computed on read via primaryFailureReason filter; no persistence table for v1"

patterns-established:
  - "meetsLearningSliceThresholds gates both visual proposals and factual_issue alerts"
  - "fixture_ack_required server-side check on evidenceRefs.fixtureOnly, not client flag alone"

requirements-completed: [LEARN-04, LEARN-06]

duration: 6min
completed: 2026-06-24
---

# Phase 163 Plan 02: Accept Hardening and Factual Alerts Summary

**Fixture-only accept gate with corpus_quality caveat plus owner factual_issue alert API using shared slice bucketing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-24T11:47:00Z
- **Completed:** 2026-06-24T11:53:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Extracted `buildLearningSliceBuckets` / `meetsLearningSliceThresholds` from aggregate for reuse
- Added `buildFactualIssueAlerts`, `listFactualIssueAlerts`, and owner `GET /api/admin/quality/learning/factual-alerts`
- Hardened accept flow: `fixture_ack_required` without `acknowledgeFixtureOnly`, `fixture_only_corpus` caveat on rules
- Aggregator job logs factual alert slice count (debug, no persistence)

## Task Commits

Each task was committed atomically:

1. **Task 1: Factual issue alert detection and API** - `93938897` (feat)
2. **Task 2: Fixture acknowledgment on accept** - `90f58e53` (feat)

## Files Created/Modified

- `app/src/server/human-quality/learning/aggregate.ts` - Shared slice bucket builder and threshold helper
- `app/src/server/human-quality/learning/factual-alerts.ts` - Factual issue alert detection and list function
- `app/src/app/api/admin/quality/learning/factual-alerts/route.ts` - Owner GET endpoint with workspace/profile filters
- `app/src/server/human-quality/calibration/types.ts` - FactualIssueAlert types and fixtureOnly on evidence
- `app/src/server/human-quality/learning/proposals.ts` - fixture_ack_required and fixture_only_corpus caveat
- `app/src/app/api/admin/quality/learning/proposals/[id]/accept/route.ts` - Zod body parse for acknowledgeFixtureOnly
- `app/src/server/jobs/learning-proposal-aggregator.ts` - Debug log for factual alert count
- `app/tests/unit/human-quality/learning/factual-alerts.test.ts` - Alert detection unit tests
- `app/src/app/api/admin/quality/learning/factual-alerts/route.test.ts` - API route tests
- `app/tests/unit/human-quality/learning/proposals.test.ts` - Fixture ack accept tests
- `app/src/app/api/admin/quality/learning/proposals/[id]/accept/route.test.ts` - Accept route fixture ack tests

## Decisions Made

- Shared slice bucketing exported from aggregate rather than duplicating threshold logic in factual-alerts
- Factual alerts remain computed on read (no DB table) per design §7 v1 scope
- Accept route defaults `acknowledgeFixtureOnly` to false when body is empty

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored missing imports after aggregate refactor**
- **Found during:** Task 1 (Factual issue alert detection and API)
- **Issue:** `buildCalibrationComparisons` import accidentally dropped during import cleanup
- **Fix:** Re-added compare/types/corpus imports in aggregate.ts
- **Files modified:** app/src/server/human-quality/learning/aggregate.ts
- **Verification:** All 20 Task 1 tests pass
- **Committed in:** 93938897 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial import fix; no scope change.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- LEARN-04 and LEARN-06 complete; plan 163-03 can proceed
- 35 learning-related unit tests pass for this plan's scope

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/learning/factual-alerts.ts
- FOUND: app/src/app/api/admin/quality/learning/factual-alerts/route.ts
- FOUND: 93938897
- FOUND: 90f58e53

---
*Phase: 163-corpus-learning-proposals*
*Completed: 2026-06-24*
