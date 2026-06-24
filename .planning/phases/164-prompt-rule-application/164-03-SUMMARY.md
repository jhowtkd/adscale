---
phase: 164-prompt-rule-application
plan: "03"
subsystem: testing
tags: [vitest, prompt-builder, calibration-rules, isolation, APPLY-05]

requires:
  - phase: 164-01
    provides: loadPromptCalibrationContext and buildDerivationPrompt section wiring
  - phase: 164-02
    provides: enforceCorpusQualityRuleCap scoped per clientProfileId
provides:
  - Cross-profile prompt and provenance isolation test suite (mock-based, no TEST_DATABASE_URL)
affects: [165-owner-calibration-panel, 167-global-cross-client-promotion]

tech-stack:
  added: []
  patterns:
    - Two-profile mock fixture with scoped listApprovedCalibrationRulesByCategories
    - Voice resolver mock to keep buildDerivationPrompt DB-free in unit tests

key-files:
  created:
    - app/tests/unit/ai/prompt-rule-isolation.test.ts
  modified: []

key-decisions:
  - "Mock resolveVoiceForClientProfile to null so clientProfileId on campaign does not require DB"
  - "Repository mocks filter by clientProfileId — reinforces scoped-query contract without global fetch"

patterns-established:
  - "Pattern: cross-profile isolation proven via loader IDs, prompt substrings, and generation log arrays"

requirements-completed: [APPLY-05]

duration: 3min
completed: 2026-06-24
---

# Phase 164 Plan 03: Cross-Profile Rule Isolation Test Summary

**Mock-based two-profile test suite proves brand-taste and corpus_quality rule IDs never leak across clientProfileIds in loader output, derivation prompts, or generation log provenance.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-24T11:22:00Z
- **Completed:** 2026-06-24T11:25:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `prompt-rule-isolation.test.ts` asserts loader `appliedBrandRuleIds` / `appliedCorpusRuleIds` are profile-scoped with repository `clientProfileId` on every fetch
- End-to-end prompt tests verify tagged `[brand-taste:*]` / `[corpus-quality:*]` constraints exclude foreign profile rule IDs
- Generation log provenance patch simulation confirms profile B arrays never include profile A rule IDs
- Section order regression (Olhar → brand-taste → corpus_quality) included in isolation scenario

## Task Commits

Each task was committed atomically (TDD: test-only — production isolation already implemented in 164-01/02):

1. **Task 1: Loader isolation assertions** - `bd72ed21` (test)
2. **Task 2: End-to-end prompt substring isolation** - `b45fa1c8` (test)

## Files Created/Modified

- `app/tests/unit/ai/prompt-rule-isolation.test.ts` - Cross-profile loader, prompt, and provenance isolation assertions with repository mocks

## Decisions Made

- Mocked `resolveVoiceForClientProfile` to return null so `buildDerivationPrompt` with `clientProfileId` stays DB-free per APPLY-05 research fallback
- Used calibrated signal fixtures (5 decisions) so brand-taste rules apply on both profiles in the two-profile scenario

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock voice resolver for buildDerivationPrompt tests**
- **Found during:** Task 2 (End-to-end prompt substring isolation)
- **Issue:** `buildDerivationPrompt` with `campaign.clientProfileId` triggered `getOlharVoiceConfigByClientProfileId` DB query
- **Fix:** Added `vi.mock` on `voice-config-resolver` returning null — matches generation-direction.test.ts pattern
- **Files modified:** `app/tests/unit/ai/prompt-rule-isolation.test.ts`
- **Commit:** `b45fa1c8`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for test file to run without TEST_DATABASE_URL; no production code changes.

## Issues Encountered

- Full app suite has 12 pre-existing failures in unrelated modules (`corpus-learning-loop.test.ts`, etc.); phase 164 scoped suite (111 tests) is green

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 164 APPLY-01..05 complete — ready for Phase 165 Owner Calibration Panel
- Cross-profile isolation contract documented for GLOBAL-05 regression in Phase 167

## Self-Check: PASSED

- FOUND: app/tests/unit/ai/prompt-rule-isolation.test.ts
- FOUND: bd72ed21, b45fa1c8

---
*Phase: 164-prompt-rule-application*
*Completed: 2026-06-24*
