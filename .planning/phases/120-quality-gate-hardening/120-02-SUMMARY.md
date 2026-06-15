---
phase: 120-quality-gate-hardening
plan: "02"
subsystem: testing
tags: [quality-gate, classifier, GATE-01, GATE-02, GATE-03, contamination]

# Dependency graph
requires:
  - phase: 120-01
    provides: GATE-01 taxonomy patterns, CreativeHardFailureCode union, normalizeHardFailureCode
provides:
  - Promote-before-polish classifiers with contract-aware mode guards
  - CONTAMINATION_FAILURE_CODES extended with factual/aesthetic GATE-01 codes
  - Unit tests for overload, generic, drift, subject replacement, decorative-only promotion
affects: [120-03, 121, 122]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "hasCampaignIdentityDrift helper: explicit 'not a faithful' overrides broad safe-pattern match"
    - "Only checklist status failed promotes; warnings stay polish-only via collectChecklistWarnings"

key-files:
  created: []
  modified:
    - app/src/server/ai/creative-quality-gate.ts
    - app/src/server/ai/factual-visual-separation.ts
    - app/tests/unit/ai/creative-quality-gate.test.ts
    - app/src/server/ai/prompt-builder.test.ts

key-decisions:
  - "hasCampaignIdentityDrift treats 'not a faithful' as drift even when CAMPAIGN_IDENTITY_SAFE_PATTERN matches 'faithful' substring"
  - "styleFidelity and creativeRisk emit style_reference_contamination (not copied_style_reference_facts)"
  - "decorative_only_variation gated to art_variation generationMode only"

patterns-established:
  - "classifyCreativeRiskFailed promotes overload/generic/missing-idea/decorative before polish fallback"
  - "formatFit drift checked before invalid_format_layout default in format_adaptation"

requirements-completed: [GATE-01, GATE-02, GATE-03]

# Metrics
duration: 4min
completed: 2026-06-15
---

# Phase 120 Plan 02: Classifier Refactor and CONTAMINATION_FAILURE_CODES Summary

**Promote-before-polish gate classifiers wire GATE-01 patterns into hard failures with mode guards; CONTAMINATION_FAILURE_CODES extended so aesthetic and factual defects block export independent of score**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-15T19:07:00Z
- **Completed:** 2026-06-15T19:11:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Refactored `classifyCreativeRiskFailed` and `classifyBriefMatchFailed` with `CreativeContract` param and promote-before-polish ordering
- Overload, severe generic template, missing dominant idea, and decorative-only notes hard-fail before polish fallback
- Campaign identity drift promoted from briefMatch/formatFit in format_adaptation before invalid_format_layout default
- styleFidelity emits `style_reference_contamination`; informationPreservation checks replaced-subject before crop default
- Extended `CONTAMINATION_FAILURE_CODES` with four new GATE-01 codes (legacy `copied_style_reference_facts` retained)
- 127 unit tests pass across creative-quality-gate and prompt-builder suites

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Refactor gate classifiers** - `75c16353` (test RED) + `da667ce3` (feat GREEN)
2. **Task 2: Extend CONTAMINATION_FAILURE_CODES and regression tests** - `88bdb6f2` (test RED) + `57b0e784` (feat GREEN)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `app/src/server/ai/creative-quality-gate.ts` — promote-before-polish classifiers, hasCampaignIdentityDrift helper, score-issue promotion extensions
- `app/src/server/ai/factual-visual-separation.ts` — CONTAMINATION_FAILURE_CODES extended
- `app/tests/unit/ai/creative-quality-gate.test.ts` — promotion path, GATE-01/02/03 regression tests
- `app/src/server/ai/prompt-builder.test.ts` — lineage contamination code assertions

## Decisions Made
- Added `hasCampaignIdentityDrift` to prevent false negative when safe pattern matches "faithful" inside "not a faithful adaptation"
- Canonical emit is `style_reference_contamination`; `copied_style_reference_facts` kept only in CONTAMINATION set for legacy rows

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed campaign drift false negative on formatFit notes**
- **Found during:** Task 1 (formatFit drift promotion test)
- **Issue:** `CAMPAIGN_IDENTITY_SAFE_PATTERN` matched "faithful" in "not a faithful NR1 format adaptation", blocking drift promotion
- **Fix:** Added `hasCampaignIdentityDrift()` — explicit `not a faithful` signal overrides safe-pattern negation
- **Files modified:** `app/src/server/ai/creative-quality-gate.ts`
- **Verification:** formatFit drift and corpus-format-campaign-drift tests pass
- **Committed in:** `da667ce3`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required for correct drift promotion on corpus exemplar notes; no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 can align corpus fixtures and flip BASELINE_GAP_COUNT using wired classifiers
- CONTAMINATION_FAILURE_CODES ready for assertParentFactualLineage checks on new codes
- No blockers

## Self-Check: PASSED
- FOUND: `.planning/phases/120-quality-gate-hardening/120-02-SUMMARY.md`
- FOUND: `app/src/server/ai/creative-quality-gate.ts`
- FOUND: `app/src/server/ai/factual-visual-separation.ts`
- FOUND: commit `75c16353`
- FOUND: commit `da667ce3`
- FOUND: commit `88bdb6f2`
- FOUND: commit `57b0e784`

---
*Phase: 120-quality-gate-hardening*
*Completed: 2026-06-15*
