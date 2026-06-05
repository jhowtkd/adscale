---
phase: 60-quality-fixtures-and-verification
plan: "01"
subsystem: testing
tags: [vitest, quality-fixtures, creative-contract, qa-gate]

requires:
  - phase: 58-scoring-and-qa-alignment
    provides: hard-failure taxonomy and gate classification rules
  - phase: 57-creative-contract-and-prompt-provenance
    provides: CreativeContract types and fictional test fixtures
provides:
  - QUALITY_FIXTURES catalog with six synthetic failure modes
  - QualityFixture and QualityFailureMode types for downstream regression
affects: [60-02, 60-03, quality-regression]

tech-stack:
  added: []
  patterns: [centralized synthetic fixture catalog for CI-safe quality regression]

key-files:
  created:
    - app/src/server/ai/quality-fixtures.ts
    - app/tests/unit/ai/quality-fixtures.test.ts
  modified: []

key-decisions:
  - "weak_preservation uses briefMatch unsupported_offer plus score-issue wrong_brand promotion"
  - "All six fixtures use invalid verdict with hard failures for clarity"

patterns-established:
  - "QualityFixture: contract + rawQaModelOutput + expected gate outcomes + regeneration snippets"

requirements-completed: [FIX-01]

duration: 8min
completed: 2026-06-05
---

# Phase 60 Plan 01: Quality Fixture Catalog Summary

**Six-fixture synthetic catalog covering wrong CTA, crop, style contamination, format layout, preservation loss, and legibility failures**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Exported `QUALITY_FIXTURES` with typed `QualityFailureMode` union for all six known beta failure categories
- Each fixture uses fictional Acme Demo data with contract, synthetic QA JSON, expected hard failures, and regeneration snippets
- Integrity tests guard against private paths and missing gate expectations

## Task Commits

1. **Task 1: Define QualityFixture types and catalog scaffold** - `0b11777` (test), `c254218` (feat)
2. **Task 2: Populate expected regeneration snippets** - included in `c254218` (feat)

## Files Created/Modified

- `app/src/server/ai/quality-fixtures.ts` - Central fixture catalog
- `app/tests/unit/ai/quality-fixtures.test.ts` - Catalog integrity tests

## Decisions Made

- Combined task 2 regeneration snippets into task 1 feat commit (same file, atomic delivery)
- weak_preservation promotes both `unsupported_offer` (QA) and `wrong_brand` (score issue)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Self-Check: PASSED

- FOUND: app/src/server/ai/quality-fixtures.ts
- FOUND: app/tests/unit/ai/quality-fixtures.test.ts
- FOUND: 0b11777, c254218

---
*Phase: 60-quality-fixtures-and-verification*
*Completed: 2026-06-05*
