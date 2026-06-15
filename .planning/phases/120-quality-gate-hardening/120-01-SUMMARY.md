---
phase: 120-quality-gate-hardening
plan: "01"
subsystem: testing
tags: [quality-gate, regex-taxonomy, i18n, GATE-01]

# Dependency graph
requires:
  - phase: 119-observable-rubric
    provides: OVERLOAD/GENERIC/MISSING_DOMINANT_IDEA rubric markers in observable-rubric.ts
provides:
  - GATE-01 CreativeHardFailureCode union with nine new blocking categories
  - Taxonomy regex patterns for drift, subject replacement, decorative-only, contamination
  - normalizeHardFailureCode for legacy persisted hardFailures JSON
  - en/pt-BR hardFailureCodes labels for all GATE-01 codes
affects: [120-02, 120-03, 121, 122]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rubric markers re-exported from observable-rubric (single source, no duplicate regex)"
    - "Legacy hard failure codes normalized at read boundary via normalizeHardFailureCode"

key-files:
  created: []
  modified:
    - app/src/server/ai/creative-quality-taxonomy.ts
    - app/src/server/ai/creative-quality-gate.ts
    - app/src/server/ai/observable-rubric.ts
    - app/messages/en.json
    - app/messages/pt-BR.json
    - app/tests/unit/ai/creative-quality-gate.test.ts

key-decisions:
  - "Broadened MISSING_DOMINANT_IDEA_MARKERS in observable-rubric to match corpus 'no NR1 audit-specific visual idea' notes"
  - "Kept copied_style_reference_facts in union for persisted JSON compat; normalize maps to style_reference_contamination"

patterns-established:
  - "GATE-01 taxonomy patterns live in creative-quality-taxonomy.ts; classifiers deferred to Plan 02"
  - "normalizeHardFailureCode maps corpus aliases format_campaign_drift and restyling_factual_contamination"

requirements-completed: [GATE-01]

# Metrics
duration: 3min
completed: 2026-06-15
---

# Phase 120 Plan 01: Taxonomy, Type Union, normalizeHardFailureCode, i18n Summary

**GATE-01 contracts: nine new hard-failure codes, taxonomy regex patterns with rubric re-exports, legacy code normalization, and bilingual operator labels — classifier promotion deferred to Plan 02**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-15T19:03:00Z
- **Completed:** 2026-06-15T19:05:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended `CreativeHardFailureCode` with all nine GATE-01 blocking categories plus legacy `copied_style_reference_facts`
- Added drift, subject-replacement, decorative-only, and broadened contamination patterns in taxonomy
- Re-exported overload/generic/missing-dominant-idea markers from `observable-rubric.ts`
- Exported `normalizeHardFailureCode` for legacy alias migration at read boundaries
- Added en/pt-BR `hardFailureCodes` labels including previously missing `invented_factual_entity`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GATE-01 taxonomy patterns and rubric marker re-exports** - `a18350a7` (test RED) + `193c136d` (feat GREEN)
2. **Task 2: Extend CreativeHardFailureCode union, normalizeHardFailureCode, and i18n** - `86ce6f49` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `app/src/server/ai/creative-quality-taxonomy.ts` — GATE-01 regex patterns and rubric marker re-exports
- `app/src/server/ai/creative-quality-gate.ts` — extended union + `normalizeHardFailureCode`
- `app/src/server/ai/observable-rubric.ts` — broadened `MISSING_DOMINANT_IDEA_MARKERS` for corpus notes
- `app/messages/en.json` — GATE-01 hard failure operator labels
- `app/messages/pt-BR.json` — GATE-01 hard failure operator labels (pt-BR)
- `app/tests/unit/ai/creative-quality-gate.test.ts` — pattern + normalization unit tests

## Decisions Made
- Broadened `MISSING_DOMINANT_IDEA_MARKERS` at the single source (`observable-rubric.ts`) so re-exported pattern matches corpus fixture language
- Preserved `copied_style_reference_facts` in the type union for read-compat; canonical emit deferred to Plan 02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Broadened MISSING_DOMINANT_IDEA_MARKERS for corpus alignment**
- **Found during:** Task 1 (taxonomy pattern tests)
- **Issue:** Re-exported `MISSING_DOMINANT_IDEA_MARKERS` did not match corpus note "no NR1 audit-specific visual idea"
- **Fix:** Updated regex in `observable-rubric.ts` to allow optional qualifiers between NR1 and visual idea
- **Files modified:** `app/src/server/ai/observable-rubric.ts`
- **Verification:** `npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "pattern"` passes
- **Committed in:** `193c136d`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for re-exported rubric marker to match corpus exemplars; no classifier behavior changed.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can wire classifiers against stable types and taxonomy patterns
- `normalizeHardFailureCode` ready for read-boundary integration in Plan 02/03
- No blockers

## Self-Check: PASSED
- FOUND: `.planning/phases/120-quality-gate-hardening/120-01-SUMMARY.md`
- FOUND: `app/src/server/ai/creative-quality-taxonomy.ts`
- FOUND: commit `a18350a7`
- FOUND: commit `193c136d`
- FOUND: commit `86ce6f49`

---
*Phase: 120-quality-gate-hardening*
*Completed: 2026-06-15*
