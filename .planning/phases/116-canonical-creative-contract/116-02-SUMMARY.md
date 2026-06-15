---
phase: 116-canonical-creative-contract
plan: "02"
subsystem: api
tags: [prompt-builder, integrity-injection, derivation, vitest, creative-contract]

requires:
  - phase: 116-canonical-creative-contract
    provides: buildCanonicalContractPromptSection, resolveCanonicalCreative from Plan 01
provides:
  - buildIntegrityPromptSection wiring VISUAL_HIERARCHY_CONTRACT and ANTI_HALLUCINATION_RULES
  - Canonical + integrity injection in buildDerivationPrompt for all three derivation modes
  - Locked injection order HARD RULES → canonical → integrity → restyling factual (if restyling) → MODE
  - extractPromptIntegritySection and extractPromptCanonicalContractSection for regression proof
  - QUALITY_FIXTURES integrity assertions and derivation job canonicalCreative persistence test
affects:
  - 116-03-mode-conflict-resolution
  - 120-gate-hardening

tech-stack:
  added: []
  patterns:
    - "resolveEffectiveContractForPrompt merges contract with campaign/diagnosis before prompt assembly"
    - "Integrity extractors slice bounded sections for CONT-04 regression proof"

key-files:
  created: []
  modified:
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/prompt-builder.test.ts
    - app/tests/unit/ai/quality-prompt-regression.test.ts
    - app/src/server/jobs/derivation.test.ts

key-decisions:
  - "Inject canonical + integrity for all modes even when contract is null, synthesizing minimal contract from config"
  - "Restyling factual-source block moved after integrity to match locked injection order"

patterns-established:
  - "Prompt section extractors use indexOfEarliest with explicit boundary markers per section"

requirements-completed: [CONT-01, CONT-04]

duration: 10min
completed: 2026-06-15
---

# Phase 116 Plan 02: Integrity Injection, Extractors, and Regression Tests Summary

**Dead VISUAL_HIERARCHY_CONTRACT and ANTI_HALLUCINATION_RULES constants now injected into every derivation prompt with extractors proving CONT-04 compliance**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-15T11:06:00Z
- **Completed:** 2026-06-15T11:09:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Wired `buildCanonicalContractPromptSection` and new `buildIntegrityPromptSection` into `buildDerivationPrompt` after hard rules
- Reordered restyling factual-source block to sit after integrity and before MODE
- Exported `extractPromptIntegritySection` and `extractPromptCanonicalContractSection` for bounded regression snapshots
- Added per-mode Vitest coverage proving canonical → integrity → MODE ordering
- Extended QUALITY_FIXTURES and derivation job tests to assert integrity injection and `canonicalCreative` persistence

## Task Commits

Each task was committed atomically:

1. **Task 116-02-01 (RED):** `ee02b60b` — test(116-02): add failing integrity injection tests
2. **Task 116-02-01 (GREEN):** `49309a35` — feat(116-02): wire canonical and integrity into derivation prompts
3. **Task 116-02-02:** `54fb6ea6` — test(116-02): extend regression and derivation canonical assertions

## Files Created/Modified

- `app/src/server/ai/prompt-builder.ts` — integrity builder, effective contract resolution, extractors, injection order
- `app/src/server/ai/prompt-builder.test.ts` — integrity injection describe.each for three modes
- `app/tests/unit/ai/quality-prompt-regression.test.ts` — integrity + canonical assertions on QUALITY_FIXTURES
- `app/src/server/jobs/derivation.test.ts` — expects `canonicalCreative` on persisted creativeContract

## Decisions Made

- Synthesize a minimal `CreativeContract` from config when `contract` is null so integrity blocks always reach the image model
- Use `resolveCanonicalCreative(contract, campaign, creativeDiagnosis)` when `canonicalCreative` is absent, matching job wiring from Plan 01

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 116-03 can resolve mode-instruction conflicts against the now-injected canonical contract block
- Extractors ready for gate-hardening regression in Phase 120

## Self-Check: PASSED

- FOUND: app/src/server/ai/prompt-builder.ts
- FOUND: app/src/server/ai/prompt-builder.test.ts
- FOUND: app/tests/unit/ai/quality-prompt-regression.test.ts
- FOUND: app/src/server/jobs/derivation.test.ts
- FOUND: ee02b60b
- FOUND: 49309a35
- FOUND: 54fb6ea6

---
*Phase: 116-canonical-creative-contract*
*Completed: 2026-06-15*
