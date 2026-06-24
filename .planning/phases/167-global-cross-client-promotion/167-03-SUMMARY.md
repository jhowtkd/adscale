---
phase: 167-global-cross-client-promotion
plan: "03"
subsystem: ui
tags: [vitest, calibration, cross-client, isolation, react-query]

requires:
  - phase: 167-01
    provides: cross-client evidenceRefs with fixtureOnly, promotionSource, supportingClientRuleIds
  - phase: 167-02
    provides: PATCH accept/reject APIs with fixture acknowledgment gate
provides:
  - Calibration tab accept/reject UI for cross-client global proposals
  - GLOBAL-05 isolation regression test suite
  - Phase 167 verification sign-off document
affects: []

tech-stack:
  added: []
  patterns:
    - "Score-calibration report merges DB proposed adjustments with full evidenceRefs"
    - "CalibrationTabContent fixture ack mirrors LearningProposalsTab checkbox gate"

key-files:
  created:
    - app/tests/unit/human-quality/learning/global-promotion-isolation.test.ts
    - .planning/phases/167-global-cross-client-promotion/167-VERIFICATION.md
  modified:
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx
    - app/src/server/human-quality/calibration/report.ts
    - app/src/server/human-quality/calibration/service.ts

key-decisions:
  - "Load proposed adjustments from listProposedAdjustments so cross-client DB rows include id and evidenceRefs"
  - "Reject uses window.prompt for reason text matching LearningProposalsTab UX"

patterns-established:
  - "GLOBAL-05 regression: mock accepted global adjustment + assert per-profile prompt isolation unchanged"

requirements-completed: [GLOBAL-03, GLOBAL-05]

duration: 12min
completed: 2026-06-24
---

# Phase 167 Plan 03: Calibration UI + Isolation Regression Summary

**Calibration tab accept/reject for cross-client global proposals with fixture acknowledgment, plus GLOBAL-05 proof that accepted global rubric adjustments do not leak corpus_quality rules across clientProfile prompts**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-24T16:00:00Z
- **Completed:** 2026-06-24T16:12:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Calibration tab shows Cross-client badge, supporting client rule IDs, and fixture-only warning
- Owner can accept (with fixture ack) or reject global proposals from Calibration tab
- Score-calibration API returns DB proposed adjustments with `id` and full `evidenceRefs`
- `global-promotion-isolation.test.ts` proves per-brand prompt isolation after mock global accept
- `167-VERIFICATION.md` signs off GLOBAL-01..05 for v13.2 finale

## Task Commits

Each task was committed atomically:

1. **Task 1: Calibration tab cross-client UI** - `1878569b` (test RED), `734c1187` (feat GREEN)
2. **Task 2: GLOBAL-05 isolation + verification** - `7e0dc355` (test), `cc4ccadc` (docs)

## Files Created/Modified

- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` - Accept/reject UI with cross-client metadata display
- `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` - 4 cross-client calibration UI tests
- `app/src/server/human-quality/calibration/report.ts` - Extended AdjustmentProposalSummary with id/evidenceRefs
- `app/src/server/human-quality/calibration/service.ts` - Report loads DB proposed adjustments
- `app/tests/unit/human-quality/learning/global-promotion-isolation.test.ts` - GLOBAL-05 regression (4 tests)
- `.planning/phases/167-global-cross-client-promotion/167-VERIFICATION.md` - Phase sign-off

## Decisions Made

- Score-calibration report uses `listProposedAdjustments` from DB rather than in-memory `proposeAdjustments` summaries, ensuring cross-client persisted proposals surface with accept/reject IDs
- Reject reason collected via `window.prompt` to match existing LearningProposalsTab pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 167 complete — v13.2 milestone finale ready for ship/audit
- All GLOBAL-01..05 requirements verified

## Self-Check: PASSED

- FOUND: app/src/components/feedback/HumanQualityCorpusPanel.tsx
- FOUND: app/tests/unit/human-quality/learning/global-promotion-isolation.test.ts
- FOUND: .planning/phases/167-global-cross-client-promotion/167-VERIFICATION.md
- FOUND: .planning/phases/167-global-cross-client-promotion/167-03-SUMMARY.md
- FOUND: 1878569b
- FOUND: 734c1187
- FOUND: 7e0dc355
- FOUND: cc4ccadc

---
*Phase: 167-global-cross-client-promotion*
*Completed: 2026-06-24*
