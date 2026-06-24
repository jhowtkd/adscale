---
phase: 164-prompt-rule-application
plan: "01"
subsystem: api
tags: [brand-taste, corpus-quality, prompt-builder, derivation, calibration-rules, vitest]

requires:
  - phase: 163-corpus-learning-proposals
    provides: corpus_quality calibration_rules and appliedCorpusRuleIds partial wiring
provides:
  - loadPromptCalibrationContext unified loader for brand-taste and corpus_quality
  - Olhar → brand-taste → corpus_quality prompt section order enforcement
  - appliedBrandRuleIds provenance on DerivationGenerationLog
affects: [164-02, 164-03, learning-impact-reports]

tech-stack:
  added: []
  patterns:
    - Unified calibration context loader with selectApplicableRules evidence gate
    - Pre-rendered brandTasteSection to avoid double-wrap in prompt-builder
    - Scoped listApprovedCalibrationRulesByCategories only (no global corpus query)

key-files:
  created:
    - app/src/server/brand-taste/prompt-calibration-loader.ts
    - app/tests/unit/brand-taste/taste-application.test.ts
    - app/tests/unit/brand-taste/prompt-calibration-loader.test.ts
    - app/tests/unit/jobs/derivation-generation-log.test.ts
  modified:
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/generation-log.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/ai/prompt-builder.test.ts

key-decisions:
  - "Brand-taste categories = all RULE_CATEGORIES except corpus_quality"
  - "Corpus cap remains prompt-time slice(0, 10) until Plan 164-02 adds DB deprecation"
  - "Auto-retry finalize merges both appliedBrandRuleIds and appliedCorpusRuleIds"

patterns-established:
  - "Pattern: loadPromptCalibrationContext returns pre-rendered sections plus ID arrays for provenance"
  - "Pattern: prompt-builder injects calibration sections immediately after buildGenerationDirectionSection"

requirements-completed: [APPLY-01, APPLY-02, APPLY-03]

duration: 8min
completed: 2026-06-24
---

# Phase 164 Plan 01: Brand-Taste Wiring, Section Order, Provenance Summary

**Unified calibration loader wires brand-taste rules through selectApplicableRules gate, enforces Olhar → brand-taste → corpus_quality prompt order, and logs both rule ID arrays on derivation finalize.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-24T11:09:00Z
- **Completed:** 2026-06-24T11:17:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `loadPromptCalibrationContext` consolidates brand-taste and corpus_quality loading with scoped repository queries and evidence gate
- Prompt-builder regression test locks mandated section order after Olhar ADScale block
- Derivation job uses unified loader step; generation log records `appliedBrandRuleIds` and `appliedCorpusRuleIds` on primary and auto-retry paths

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: Calibration context loader and taste-application gate tests** - `c45d552b` (test), `7f75925a` (feat)
2. **Task 2: Prompt-builder section order regression** - `a4424295` (test), `92437a41` (feat)
3. **Task 3: Derivation job wiring and generation log provenance** - `a7bebb2c` (test), `4f838525` (feat)

## Files Created/Modified

- `app/src/server/brand-taste/prompt-calibration-loader.ts` - Unified async loader for brand-taste and corpus sections plus ID arrays
- `app/src/server/ai/prompt-builder.ts` - Section order fix; `brandTasteSection` config for pre-rendered lines
- `app/src/server/ai/generation-log.ts` - `appliedBrandRuleIds` field on `DerivationGenerationLog`
- `app/src/server/jobs/derivation.ts` - `load-prompt-calibration-context` step and dual provenance finalize
- `app/tests/unit/brand-taste/taste-application.test.ts` - Evidence gate coverage for uncalibrated skip
- `app/tests/unit/brand-taste/prompt-calibration-loader.test.ts` - Scoped category and ID array assertions
- `app/src/server/ai/prompt-builder.test.ts` - Section order regression test
- `app/tests/unit/jobs/derivation-generation-log.test.ts` - Provenance patch tests

## Decisions Made

- Preserved prompt-time `slice(0, 10)` for corpus rules per plan scope (DB deprecation deferred to 164-02)
- Kept `brandTasteConstraints` fallback in prompt-builder for backward compat when `brandTasteSection` is absent
- Auto-retry finalize includes both ID arrays for consistent provenance (research open question #2 resolved)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 164-02: `enforceCorpusQualityRuleCap` with DB deprecation on overflow
- Plan 164-03: cross-profile isolation integration test (APPLY-05) still pending in later plan

## Self-Check: PASSED

- FOUND: app/src/server/brand-taste/prompt-calibration-loader.ts
- FOUND: app/tests/unit/brand-taste/prompt-calibration-loader.test.ts
- FOUND: app/tests/unit/jobs/derivation-generation-log.test.ts
- FOUND: c45d552b, 7f75925a, a4424295, 92437a41, a7bebb2c, 4f838525

---
*Phase: 164-prompt-rule-application*
*Completed: 2026-06-24*
