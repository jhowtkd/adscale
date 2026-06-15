---
phase: 119-observable-rubric
plan: "01"
subsystem: api
tags: [rubric, creative-qa, creative-score, vitest, observable-defects]

requires:
  - phase: 118-per-mode-prompt-rules
    provides: THREE-ZONE visual budget and thumbnail legibility generation rules
  - phase: 117-factual-visual-separation
    provides: module pattern for shared prompt sections and extractors
provides:
  - observable-rubric.ts shared rubric constants and builders for QA/score prompts
  - Module-level regression tests for RUBR-01 through RUBR-04
  - Phase 120 forward-reference note markers (OVERLOAD, GENERIC_TEMPLATE, MISSING_DOMINANT_IDEA)
affects:
  - 119-02-PLAN.md (wire rubric into creative-qa.ts)
  - 119-03-PLAN.md (wire rubric into creative-score.ts)
  - 120-quality-gate-hardening (note marker regex promotion)

tech-stack:
  added: []
  patterns:
    - "Mirror factual-visual-separation.ts module layout for evaluation rubric prose"
    - "Format-derived preview dimensions via getTargetDimensions(format, true)"

key-files:
  created:
    - app/src/server/ai/observable-rubric.ts
    - app/tests/unit/ai/quality-rubric-regression.test.ts
  modified: []

key-decisions:
  - "Map overload/generic/thumbnail defects to existing criteria (creativeRisk, legibility, briefMatch) — no new checklist keys"
  - "Score rubric extends QA rubric with visualQuality caps block rather than duplicating prose"

patterns-established:
  - "extractObservableRubricSection bounds from OBSERVABLE DEFECT NOTES through THUMBNAIL / PREVIEW SCALE"
  - "FORBIDDEN_APPROVAL_TERMS drives both rubric prose and test assertions for RUBR-03"

requirements-completed: [RUBR-01, RUBR-02, RUBR-03, RUBR-04]

duration: 8min
completed: 2026-06-15
---

# Phase 119 Plan 01: Observable Rubric Module Scaffold Summary

**Shared observable rubric module with overload, generic-template, defect-note, and thumbnail blocks — format-derived preview dimensions and Phase 120 note markers**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-15T15:37:00Z
- **Completed:** 2026-06-15T15:45:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `observable-rubric.ts` exporting all rubric constants, QA/score builders, extractor, and RegExp note markers
- `buildThumbnailHookRubricLine("1:1")` interpolates 270×270px from `getTargetDimensions(format, true)`
- Added 6 module-level regression tests covering RUBR-01–04 before prompt wiring (Plans 02–03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create observable-rubric module with all rubric blocks** - `289ff986` (feat)
2. **Task 2: Add module-level rubric regression tests** - `f759b768` (test)

**Plan metadata:** pending (docs commit)

## Files Created/Modified

- `app/src/server/ai/observable-rubric.ts` — rubric constants, builders, extractor, Phase 120 markers
- `app/tests/unit/ai/quality-rubric-regression.test.ts` — RUBR-01–04 presence and round-trip tests

## Decisions Made

- Reused existing criterion IDs (creativeRisk, legibility, briefMatch) per plan — no new checklist keys
- Score section adds `SCORE VISUAL QUALITY CAPS` block on top of shared core rubric lines

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Overload rubric CTA wording for test pattern**
- **Found during:** Task 2 (rubric regression tests)
- **Issue:** `/competing.*CTA/i` did not match "Multiple CTAs ... compete with the primary hook"
- **Fix:** Changed to "Multiple competing CTAs or button-like modules fight the primary hook"
- **Files modified:** `app/src/server/ai/observable-rubric.ts`
- **Verification:** `npm test -- tests/unit/ai/quality-rubric-regression.test.ts` — 6/6 pass
- **Committed in:** `f759b768` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Wording tweak only; semantics unchanged.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 119-02 can wire `buildObservableQaRubricSection` into `creative-qa.ts`
- Plan 119-03 can wire `buildObservableScoreRubricSection` into `creative-score.ts`
- Phase 120 can import `OVERLOAD_NOTE_MARKERS`, `GENERIC_TEMPLATE_NOTE_MARKERS`, `MISSING_DOMINANT_IDEA_MARKERS`

## Self-Check: PASSED

- FOUND: app/src/server/ai/observable-rubric.ts
- FOUND: app/tests/unit/ai/quality-rubric-regression.test.ts
- FOUND: 289ff986
- FOUND: f759b768

---
*Phase: 119-observable-rubric*
*Completed: 2026-06-15*
