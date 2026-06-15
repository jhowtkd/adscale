---
phase: 119-observable-rubric
plan: "02"
subsystem: api
tags: [rubric, creative-qa, vitest, observable-defects, export-softening]

requires:
  - phase: 119-01
    provides: observable-rubric.ts with buildObservableQaRubricSection and extractObservableRubricSection
provides:
  - QA vision prompt wired with full observable rubric section
  - Export-softening bias removed; integrity-first failed-criteria language
  - Regression tests for RUBR-01–04 rubric injection in creative-qa.test.ts
affects:
  - 119-03-PLAN.md (wire rubric into creative-score.ts)
  - 120-quality-gate-hardening (gate unchanged until Phase 120)

tech-stack:
  added: []
  patterns:
    - "Re-export extractObservableRubricSection from creative-qa.ts (match Phase 118 extractor pattern)"
    - "Inject rubric after styleFidelity/allowedEntities blocks, before locale line"

key-files:
  created: []
  modified:
    - app/src/server/ai/creative-qa.ts
    - app/src/server/ai/creative-qa.test.ts

key-decisions:
  - "Rubric receives targetFormat from derivation.format ?? contract.targetFormat"
  - "Top-level QA status enum unchanged (ready|warning|review); checklist items use failed"

patterns-established:
  - "extractObservableRubricSection re-exported from creative-qa for test round-trip assertions"

requirements-completed: [RUBR-01, RUBR-02, RUBR-03, RUBR-04]

duration: 6min
completed: 2026-06-15
---

# Phase 119 Plan 02: Wire Observable Rubric into QA Prompt Summary

**QA vision prompt injects full observable rubric via buildObservableQaRubricSection; export-softening removed and integrity-first failed-criteria language added**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-15T15:40:00Z
- **Completed:** 2026-06-15T15:46:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Removed "Export must remain allowed" export-softening bias (RUBR-03)
- Injected `buildObservableQaRubricSection` with format/mode/dominantIdea from contract and derivation
- Added 4 regression tests for rubric injection, export-softening absence, and contract preservation
- Confirmed creative-quality-gate polish-only behavior unchanged (Phase 120 scope)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED:** `4b2c68a6` (test) — failing observable rubric QA prompt tests
2. **Task 1 GREEN:** `31a0ec00` (feat) — wire rubric into buildCreativeQaPrompt
3. **Task 2:** `838f175a` (test) — contract preservation assertions

**Plan metadata:** pending (docs commit)

## TDD Gate Compliance

- RED commit `4b2c68a6` precedes GREEN commit `31a0ec00` — compliant

## Files Created/Modified

- `app/src/server/ai/creative-qa.ts` — rubric injection, integrity-first language, extractor re-export
- `app/src/server/ai/creative-qa.test.ts` — observable rubric describe block + contract assertions

## Decisions Made

- Rubric placement after styleFidelity/allowedEntities instructions, before locale line per plan
- Re-exported `extractObservableRubricSection` from creative-qa.ts for test round-trip (Phase 118 pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 119-03 can wire `buildObservableScoreRubricSection` into `creative-score.ts`
- Phase 120 can promote creativeRisk failed overload/generic notes to hard gate failures

## Self-Check: PASSED

- FOUND: app/src/server/ai/creative-qa.ts
- FOUND: app/src/server/ai/creative-qa.test.ts
- FOUND: 4b2c68a6
- FOUND: 31a0ec00
- FOUND: 838f175a

---
*Phase: 119-observable-rubric*
*Completed: 2026-06-15*
