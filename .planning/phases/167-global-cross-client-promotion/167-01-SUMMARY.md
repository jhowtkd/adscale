---
phase: 167-global-cross-client-promotion
plan: "01"
subsystem: api
tags: [vitest, calibration, cross-client, corpus-quality, evidence-refs]

requires: []
provides:
  - Extended CalibrationAdjustmentEvidence with cross-client metadata fields
  - fixtureOnly gate computed from evaluated row sourceLabel
  - supportingClientRuleIds on persisted global proposals
  - promotionSource cross_client tagging on evidenceRefs
affects:
  - 167-02-PLAN
  - 167-03-PLAN

tech-stack:
  added: []
  patterns:
    - "Mirror aggregate.ts fixtureOnly: all synthetic_fixture rows → true"
    - "Enrich proposeAdjustments output before persistProposedAdjustments in cross-client detector"

key-files:
  created: []
  modified:
    - app/src/server/human-quality/calibration/types.ts
    - app/src/server/human-quality/learning/cross-client.ts
    - app/tests/unit/human-quality/learning/cross-client.test.ts

key-decisions:
  - "Always set fixtureOnly boolean (true/false) on cross-client evidenceRefs, not only when true"
  - "primaryFailureReason on evidenceRefs uses rule rationale prefix, distinct from adjustment targetKey"

patterns-established:
  - "Cross-client enrichment layer between proposeAdjustments and persistProposedAdjustments"

requirements-completed: [GLOBAL-01, GLOBAL-02, GLOBAL-03]

duration: 8min
completed: 2026-06-24
---

# Phase 167 Plan 01: Cross-Client Detector Hardening Summary

**Cross-client global proposals now persist fixtureOnly, supportingClientRuleIds, primaryFailureReason, and promotionSource on evidenceRefs without changing detection thresholds**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-24T15:34:00Z
- **Completed:** 2026-06-24T15:42:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Extended `CalibrationAdjustmentEvidence` with optional cross-client metadata fields
- `detectAndPersistCrossClientGlobalProposals` computes `fixtureOnly` from `sourceLabel` on filtered evaluated rows
- Persisted proposals include `supportingClientRuleIds`, `primaryFailureReason`, and `promotionSource: "cross_client"`
- Unit tests cover fixture composition gate, supporting rule links, promotion tagging, and GLOBAL-01 regression

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend evidence type + cross-client enrichment** - `cbffbc96` (test RED), `b2dc3636` (feat GREEN)

## Files Created/Modified

- `app/src/server/human-quality/calibration/types.ts` - Added optional cross-client evidence fields
- `app/src/server/human-quality/learning/cross-client.ts` - Enriched proposals before persistence
- `app/tests/unit/human-quality/learning/cross-client.test.ts` - Added fixtureOnly, supportingClientRuleIds, promotionSource assertions

## Decisions Made

- Set `fixtureOnly` explicitly as boolean on every cross-client proposal (not only when true), matching test contract for mixed-source detection
- `primaryFailureReason` on evidenceRefs stores the rule rationale prefix; `targetKey` remains the failure-bridge adjustment target (e.g. `illegible_cta` → `unreadable_required_text`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test correction] Happy-path targetKey assertion aligned with failure-bridge**
- **Found during:** Task 1 (RED test run)
- **Issue:** Prior test asserted `targetKey === "illegible_cta"` but only passed because `mockPersistProposed` returned a hardcoded proposal; real `proposeAdjustments` maps to `unreadable_required_text`
- **Fix:** Updated assertion to `unreadable_required_text`; switched mock to `mockImplementation` returning actual proposals
- **Files modified:** `app/tests/unit/human-quality/learning/cross-client.test.ts`
- **Verification:** All 10 cross-client tests pass
- **Committed in:** `cbffbc96`

---

**Total deviations:** 1 auto-fixed (1 bug in test expectations)
**Impact on plan:** Test-only correction; no production behavior change beyond plan scope.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 1 server evidence contract complete for GLOBAL-01..03 metadata
- Ready for 167-02: reject lifecycle + accept metadata hardening
- Calibration UI (167-03) can consume `supportingClientRuleIds` and `fixtureOnly` from persisted adjustments

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/calibration/types.ts
- FOUND: app/src/server/human-quality/learning/cross-client.ts
- FOUND: app/tests/unit/human-quality/learning/cross-client.test.ts
- FOUND: .planning/phases/167-global-cross-client-promotion/167-01-SUMMARY.md
- FOUND: cbffbc96
- FOUND: b2dc3636

---
*Phase: 167-global-cross-client-promotion*
*Completed: 2026-06-24*
