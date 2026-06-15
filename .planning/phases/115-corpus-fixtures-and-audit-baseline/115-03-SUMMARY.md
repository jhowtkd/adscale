---
phase: 115-corpus-fixtures-and-audit-baseline
plan: "03"
subsystem: testing
tags: [vitest, quality-gate, corpus-fixtures, baseline-red, it.fails]

requires:
  - phase: 115-01
    provides: creative-corpus manifest index and canonical campaigns
  - phase: 115-02
    provides: CORPUS_ARCHETYPE_FIXTURES with QA outputs and baseline metadata
provides:
  - Red baseline gate matrix proving current gate gaps per corpus archetype
  - BASELINE_GAP_COUNT export for Phase 123 validation
  - Regression guard alongside v11.5 quality-fixture-pipeline tests
affects:
  - 120-gate-hardening
  - 123-visual-validation-gate

tech-stack:
  added: []
  patterns:
    - "it.fails documents intent while baseline-snapshot keeps CI green"
    - "BASELINE_GAP_COUNT constant for downstream validation scripts"

key-files:
  created:
    - app/tests/unit/ai/corpus-baseline.test.ts
  modified:
    - app/src/server/ai/corpus-fixtures.ts
    - app/tests/unit/ai/corpus-fixtures.test.ts

key-decisions:
  - "baselineVerdict aligned to actual gate output — three fixtures had stale metadata from audit assumptions"
  - "Partial gaps (invalid verdict but wrong codes) documented via it.fails on hard-failure codes, not verdict alone"

patterns-established:
  - "baseline-red + baseline-snapshot pairing for migration path to Phase 120"

requirements-completed: [FIXT-04]

duration: 8min
completed: 2026-06-15
---

# Phase 115 Plan 03: Red Baseline Gate Tests Summary

**Vitest it.fails matrix documents five corpus archetype gate gaps while snapshot tests lock current wrongful/partial verdicts for Phase 120 migration**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-15T13:28:00Z
- **Completed:** 2026-06-15T13:36:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `corpus-baseline.test.ts` with `describe.each(CORPUS_ARCHETYPE_FIXTURES)` running normalize → classify → derive pipeline
- Five `it.fails` tests document required invalid verdict + target hard-failure codes (all fail as expected today)
- Five `baseline-snapshot` tests record current gate verdicts per archetype
- Coverage guards: all `CorpusArchetype` values, primary audit ids (`27069645`, `538246da`, `d7d9d323`), `BASELINE_GAP_COUNT = 5`
- `quality-fixture-pipeline.test.ts` remains green (21 passed + 5 expected fail)

## Task Commits

1. **Task 1: Baseline-red gate matrix for corpus archetypes** - `fe5e911a` (test)
2. **Task 2: Regression guard and corpus coverage report** - `ef5dded9` (feat)

## Files Created/Modified

- `app/tests/unit/ai/corpus-baseline.test.ts` - Red baseline gate matrix, coverage guards, `BASELINE_GAP_COUNT`
- `app/src/server/ai/corpus-fixtures.ts` - Corrected `baselineVerdict` for three archetypes
- `app/tests/unit/ai/corpus-fixtures.test.ts` - Catalog test allows `invalid` baseline for partial gaps

## Decisions Made

- Partial gate gaps (format drift, restyling) keep `baselineVerdict: "invalid"` because the gate rejects but with wrong/missing taxonomy codes — `it.fails` targets code coverage, snapshots lock verdict
- `BASELINE_GAP_COUNT` counts all five archetypes (verdict or code gap) for Phase 123 reference

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Aligned baselineVerdict metadata with actual gate output**
- **Found during:** Task 1 (baseline-snapshot tests)
- **Issue:** Three fixtures had `baselineVerdict` from audit assumptions that didn't match `classifyCreativeQualityGate` + `deriveQualityVerdict` output
- **Fix:** Set `generic_template_aesthetic` → `acceptable`; `format_campaign_drift` and `restyling_factual_contamination` → `invalid`
- **Files modified:** `app/src/server/ai/corpus-fixtures.ts`, `app/tests/unit/ai/corpus-fixtures.test.ts`
- **Verification:** `npm test -- tests/unit/ai/corpus-baseline.test.ts` — 5 passed, 5 expected fail
- **Committed in:** `fe5e911a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Metadata correction required for snapshot tests to pass; no change to FIXT-04 intent.

## Issues Encountered

None beyond baselineVerdict mismatch (resolved via deviation above).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 120 can flip `it.fails` → `it` and remove `baseline-snapshot` tests when gate hardens
- `BASELINE_GAP_COUNT` available for Phase 123 validation script

## Self-Check: PASSED

- FOUND: app/tests/unit/ai/corpus-baseline.test.ts
- FOUND: fe5e911a
- FOUND: ef5dded9

---
*Phase: 115-corpus-fixtures-and-audit-baseline*
*Completed: 2026-06-15*
