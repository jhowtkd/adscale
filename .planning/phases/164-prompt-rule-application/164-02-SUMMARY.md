---
phase: 164-prompt-rule-application
plan: "02"
subsystem: api
tags: [corpus-quality, calibration-rules, deprecation, vitest, proposals]

requires:
  - phase: 164-01
    provides: loadPromptCalibrationContext with slice-only corpus cap
provides:
  - enforceCorpusQualityRuleCap with DB deprecation on overflow
  - Accept-hook cap enforcement after corpus_quality rule insert
  - Loader safety-net cap via enforceCorpusQualityRuleCap
affects: [164-03, learning-impact-reports]

tech-stack:
  added: []
  patterns:
    - Centralized cap module deprecates oldest rules by approvedAt ASC
    - Accept-time enforcement primary; loader acts as legacy overflow safety net
    - Shared MAX_CORPUS_QUALITY_RULES exported from corpus-quality-prompt.ts

key-files:
  created:
    - app/src/server/human-quality/learning/corpus-quality-cap.ts
    - app/tests/unit/repositories/calibration-rule-cap.test.ts
  modified:
    - app/src/server/human-quality/learning/proposals.ts
    - app/src/server/brand-taste/prompt-calibration-loader.ts
    - app/src/server/human-quality/learning/corpus-quality-prompt.ts
    - app/tests/unit/human-quality/learning/proposals.test.ts
    - app/tests/unit/brand-taste/prompt-calibration-loader.test.ts

key-decisions:
  - "Accept-time cap enforcement is primary; loader cap is safety net for legacy overflow"
  - "Oldest rule selection uses approvedAt ASC with createdAt fallback"
  - "MAX_CORPUS_QUALITY_RULES exported from corpus-quality-prompt.ts as single constant"

patterns-established:
  - "Pattern: enforceCorpusQualityRuleCap returns { active, deprecatedIds } for observability"
  - "Pattern: buildCorpusQualityPromptSection retains defensive slice as last resort"

requirements-completed: [APPLY-04]

duration: 5min
completed: 2026-06-24
---

# Phase 164 Plan 02: Corpus Quality Cap with DB Deprecation Summary

**enforceCorpusQualityRuleCap deprecates oldest approved corpus_quality rules in DB on overflow, wired on proposal accept and derivation loader.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-24T14:15:00Z
- **Completed:** 2026-06-24T14:20:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `enforceCorpusQualityRuleCap` sorts by `approvedAt` (fallback `createdAt`) and deprecates overflow via `deprecateCalibrationRule`
- `acceptClientLearningProposal` reloads approved corpus rules and enforces cap immediately after insert
- `loadPromptCalibrationContext` replaces slice-only cap with `enforceCorpusQualityRuleCap` as load-time safety net

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: enforceCorpusQualityRuleCap with deprecation** - `2ceb6c2a` (test), `c90abe43` (feat)
2. **Task 2: Wire cap on accept and loader safety net** - `19df0f81` (test), `e3e89a7e` (feat)

## Files Created/Modified

- `app/src/server/human-quality/learning/corpus-quality-cap.ts` - Cap enforcement with DB deprecation
- `app/tests/unit/repositories/calibration-rule-cap.test.ts` - Unit tests for cap behavior and deprecate calls
- `app/src/server/human-quality/learning/proposals.ts` - Post-accept cap hook
- `app/src/server/brand-taste/prompt-calibration-loader.ts` - Loader uses cap module instead of slice
- `app/src/server/human-quality/learning/corpus-quality-prompt.ts` - Exported shared MAX constant
- `app/tests/unit/human-quality/learning/proposals.test.ts` - Cap invocation assertion on accept
- `app/tests/unit/brand-taste/prompt-calibration-loader.test.ts` - Cap module mock instead of slice test

## Decisions Made

- Accept-time enforcement is primary per research open question #1; loader cap handles legacy overflow rows
- Exported `MAX_CORPUS_QUALITY_RULES` from `corpus-quality-prompt.ts` to avoid duplicate constants
- Kept defensive slice inside `buildCorpusQualityPromptSection` as last resort per plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 164-03: cross-profile isolation integration test (APPLY-05)
- Learning impact reports will no longer over-count orphaned approved corpus_quality rows

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/learning/corpus-quality-cap.ts
- FOUND: app/tests/unit/repositories/calibration-rule-cap.test.ts
- FOUND: 2ceb6c2a, c90abe43, 19df0f81, e3e89a7e

---
*Phase: 164-prompt-rule-application*
*Completed: 2026-06-24*
