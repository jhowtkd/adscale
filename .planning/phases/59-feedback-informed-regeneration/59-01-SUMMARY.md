---
phase: 59-feedback-informed-regeneration
plan: "01"
subsystem: ai
tags: [regeneration, creative-contract, quality-gate, vitest]
requires:
  - phase: 57-creative-contract-and-prompt-provenance
    provides: CreativeContract JSON on derivations
  - phase: 58-scoring-and-qa-alignment
    provides: quality taxonomy and normalized score/QA
provides:
  - Unified regeneration correction brief builder
  - Shared preservation suggestion primitive
affects: [59-02, 59-03, 59-04]
tech-stack:
  added: []
  patterns: [single brief assembly path for gate and regenerate]
key-files:
  created:
    - app/src/server/ai/regeneration-correction-brief.ts
    - app/src/server/ai/regeneration-suggestion.ts
    - app/tests/unit/ai/regeneration-correction-brief.test.ts
  modified:
    - app/src/server/ai/creative-score.ts
    - app/src/server/ai/creative-quality-gate.ts
key-decisions:
  - "Extract buildRegenerationSuggestion to regeneration-suggestion.ts to avoid circular imports"
  - "1800-char internal cap preserves contract tail; route Zod 2000 limit unchanged"
patterns-established:
  - "Labeled brief sections (Hard failures / Score issues / QA issues / Feedback context) precede contract preservation tail"
requirements-completed: [AIR-01, AIR-02]
duration: 25min
completed: 2026-06-05
---

# Phase 59 Plan 01: Unified Regeneration Correction Brief Builder Summary

**Single server module merges gate, score, QA, and feedback-category inputs into bounded correction briefs with contract-safe preservation tails.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `buildRegenerationCorrectionBrief`, `mergeUserRegenerationNotes`, and `deriveRegenerationPreview`
- Delegated `buildHardFailureRegenerationSuggestion` and quality-gate persistence to the unified builder
- QA checklist failures now flow into stored regeneration suggestions

## Task Commits

1. **Task 1: Add correction brief types and builder module** - `4c79cab`
2. **Task 2: Delegate creative-score and quality-gate** - `e5c631c`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted regeneration-suggestion module**
- **Found during:** Task 1
- **Issue:** Circular import between creative-score and regeneration-correction-brief
- **Fix:** Moved `buildRegenerationSuggestion` to `regeneration-suggestion.ts`
- **Files modified:** `app/src/server/ai/regeneration-suggestion.ts`, `app/src/server/ai/creative-score.ts`

Otherwise executed as written.

## Self-Check: PASSED

- FOUND: app/src/server/ai/regeneration-correction-brief.ts
- FOUND: app/tests/unit/ai/regeneration-correction-brief.test.ts
- FOUND: 4c79cab, e5c631c
