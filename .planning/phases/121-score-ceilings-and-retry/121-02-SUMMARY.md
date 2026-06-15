---
phase: 121-score-ceilings-and-retry
plan: 02
subsystem: ai
tags: [auto-retry, restyling, scr-04, derivation, openai-images-edit]

requires:
  - phase: 121-score-ceilings-and-retry
    plan: 03
    provides: FAILURE_CORRECTION_DIRECTIVES and restyling factual-source rule in correction brief
  - phase: 120-gate-hardening
    provides: CreativeHardFailureCode taxonomy and normalizeHardFailureCode
provides:
  - Mode-aware shouldAutoRetryDerivation with per-mode retryable code sets
  - Restyling auto-retry enabled from original base + style asset keys
  - Two-image OpenAI edit path for restyling retry matching first-pass order
affects:
  - derivation job pipeline
  - SCR-04 source integrity for restyling retries

tech-stack:
  added: []
  patterns:
    - "Per-mode RETRYABLE_BY_MODE sets with normalizeHardFailureCode alias matching"
    - "Job resolves baseAssetId/styleAssetId from contract; never uses outputKey for restyling retry"
    - "Restyling auto-retry images.edit uses [base-image, style-reference] array"

key-files:
  created:
    - app/tests/unit/ai/derivation-auto-retry-policy.test.ts
    - app/src/server/ai/derivation-auto-retry.integration.test.ts
  modified:
    - app/src/server/ai/derivation-auto-retry-policy.ts
    - app/src/server/ai/derivation-auto-retry.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/jobs/derivation.test.ts
    - app/src/server/ai/derivation-auto-retry.test.ts

key-decisions:
  - "Restyling retry resolves assets from contract baseAssetId/styleAssetId with role fallbacks"
  - "Missing style asset skips retry in job wiring; auto-retry module warns and falls back to base-only"
  - "copied_style_reference_facts included in restyling set and normalized to style_reference_contamination"

patterns-established:
  - "shouldAutoRetryDerivation(generationMode, hardFailures, autoRetryAttempted) mode-first signature"
  - "Non-restyling modes retain single-image edit; restyling uses two-image when styleReferenceKey present"

requirements-completed: [SCR-04]

duration: 8min
completed: 2026-06-15
---

# Phase 121 Plan 02: Mode-Aware Restyling Auto-Retry Summary

**SCR-04 restyling auto-retry from original base + style assets via mode-aware policy and two-image OpenAI edit**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-15T19:48:00Z
- **Completed:** 2026-06-15T19:51:10Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- `shouldAutoRetryDerivation` is mode-aware with per-mode retryable code sets; restyling contamination retryable, invented entity and campaign drift excluded
- Removed restyling blanket skip in derivation job; retry uses `baseAsset.key` and `styleAsset.key` from contract-resolved assets
- `runDerivationAutoRetry` passes `[base-image, style-reference]` to `images.edit` for restyling, mirroring first-pass generation order
- Correction feedback inherits SCR-05 directives from Plan 03 via existing `regenerationSuggestion` / `buildHardFailureRegenerationSuggestion` path

## Task Commits

Each task was committed atomically (TDD RED + GREEN):

1. **Task 1: Mode-aware retry policy** — `d6ae143e` (test), `1e1f61b0` (feat)
2. **Task 2: Job wiring — remove restyling skip + factual asset keys** — `41819cde` (test), `262109e1` (feat)
3. **Task 3: Two-image restyling auto-retry** — `4bf288d3` (test), `76b8afc7` (feat)

**Plan metadata:** pending (docs commit)

## Files Created/Modified

- `app/src/server/ai/derivation-auto-retry-policy.ts` — mode-specific RETRYABLE_BY_MODE sets, generationMode-first signature
- `app/src/server/ai/derivation-auto-retry.ts` — styleReferenceKey input, two-image edit path
- `app/src/server/jobs/derivation.ts` — restyling retry enabled with factual asset resolution
- `app/tests/unit/ai/derivation-auto-retry-policy.test.ts` — mode matrix and alias normalization tests
- `app/src/server/ai/derivation-auto-retry.integration.test.ts` — OpenAI two-image call assertions
- `app/src/server/jobs/derivation.test.ts` — restyling retry job wiring test with partial mock

## Decisions Made

- Job wiring skips retry when base or style asset missing (logs warning) rather than falling back to contaminated outputKey
- Integration tests colocated at `derivation-auto-retry.integration.test.ts` to avoid polluting policy-only test file
- `creative-quality-gate` mock in derivation.test.ts uses importOriginal so `normalizeHardFailureCode` works with real policy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Partial mock for creative-quality-gate in derivation.test.ts**
- **Found during:** Task 2 (restyling retry job test)
- **Issue:** Full mock of creative-quality-gate omitted `normalizeHardFailureCode`, breaking real `shouldAutoRetryDerivation` in job test
- **Fix:** Switched to `importOriginal` partial mock preserving normalizeHardFailureCode
- **Files modified:** `app/src/server/jobs/derivation.test.ts`
- **Committed in:** `41819cde`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for job integration test to exercise real policy; no scope creep.

## Issues Encountered

None beyond the mock fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SCR-04 complete; restyling contamination failures eligible for one auto-retry from uncorrupted sources
- Phase 121 all three plans complete; ready for Phase 122 regression suite verification

## Self-Check: PASSED

- `app/src/server/ai/derivation-auto-retry-policy.ts` — FOUND
- `app/tests/unit/ai/derivation-auto-retry-policy.test.ts` — FOUND
- `app/src/server/ai/derivation-auto-retry.integration.test.ts` — FOUND
- Commits `d6ae143e`, `1e1f61b0`, `41819cde`, `262109e1`, `4bf288d3`, `76b8afc7` — FOUND in git log
- `cd app && npm test -- tests/unit/ai/derivation-auto-retry-policy.test.ts` — 9/9 passed
- `cd app && npm test -- src/server/jobs/derivation.test.ts -t "restyling"` — passed
- `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts` — 14/14 passed

---
*Phase: 121-score-ceilings-and-retry*
*Completed: 2026-06-15*
