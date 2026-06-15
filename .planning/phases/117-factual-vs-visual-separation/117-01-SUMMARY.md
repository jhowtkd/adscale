---
phase: 117-factual-vs-visual-separation
plan: "01"
subsystem: api
tags: [creative-contract, prompt-builder, derivation, factual-visual-separation, vitest]

requires:
  - phase: 116-canonical-creative-contract
    provides: integrity injection order, canonical creative contract on CreativeContract
provides:
  - InputSourceClassification types and resolver on CreativeContract
  - INPUT SOURCE CLASSIFICATION prompt section for all derivation modes
  - CONTAMINATION_FAILURE_CODES lineage set (without invented_factual_entity — Plan 04)
  - Job persistence of inputSourceClassification on creativeContract
affects:
  - 117-02-PLAN (visual reference transfer rules)
  - 117-03-PLAN (lineage firewall)
  - 117-04-PLAN (invented_factual_entity gate)

tech-stack:
  added: []
  patterns:
    - "Classification block injected after integrity, before mode-specific factual-source and MODE blocks"
    - "resolveInputSourceClassification shared between prompt-builder and derivation job"

key-files:
  created:
    - app/src/server/ai/factual-visual-separation.ts
  modified:
    - app/src/server/ai/creative-contract.ts
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/ai/prompt-builder.test.ts
    - app/src/server/jobs/derivation.test.ts

key-decisions:
  - "CONTAMINATION_FAILURE_CODES omits invented_factual_entity until Plan 04 extends the set"
  - "Classification resolves inline in prompt-builder when contract lacks persisted inputSourceClassification"

patterns-established:
  - "INPUT SOURCE CLASSIFICATION block lists factual base, visual reference, brand kit, and auxiliary references with explicit subordination language"

requirements-completed: [SEP-01]

duration: 12min
completed: 2026-06-15
---

# Phase 117 Plan 01: Input Source Classification Summary

**Machine-readable input role classification on CreativeContract with INPUT SOURCE CLASSIFICATION prompt injection after integrity blocks for all derivation modes**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `factual-visual-separation.ts` with `InputSourceRole`, `InputSourceClassification`, resolver, prompt section builder, and test extractor
- Extended `CreativeContract` with optional `inputSourceClassification`
- Wired classification into `buildDerivationPrompt` after integrity injection and before MODE blocks
- Derivation job persists `inputSourceClassification` on `resolvedContract` before prompt build
- Added 13 unit/integration tests covering three modes, injection order, and job persistence

## Task Commits

1. **Task 1: Create factual-visual-separation module with classification types and builder** - `a3a05a5b` (feat)
2. **Task 2: Wire classification into prompt builder and derivation job** - `4dd07445` (feat)

## Files Created/Modified

- `app/src/server/ai/factual-visual-separation.ts` - Types, `CONTAMINATION_FAILURE_CODES`, resolver, prompt section builder, extractor
- `app/src/server/ai/creative-contract.ts` - Optional `inputSourceClassification` field
- `app/src/server/ai/prompt-builder.ts` - Classification injection after integrity block
- `app/src/server/jobs/derivation.ts` - Persist classification on resolved contract
- `app/src/server/ai/prompt-builder.test.ts` - Input classification and prompt-order tests
- `app/src/server/jobs/derivation.test.ts` - Job persistence test with brand kit + client refs

## Decisions Made

- `CONTAMINATION_FAILURE_CODES` includes `copied_style_reference_facts`, `wrong_brand`, and `unsupported_offer` only — `invented_factual_entity` deferred to Plan 04 per plan
- Prompt builder resolves classification inline when contract field is unset, allowing job-persisted value to take precedence when present

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SEP-01 complete; Plans 02–04 can build on persisted classification and prompt block
- Plan 02 should extend restyling visual transfer rules and guard `visualTokenBrief`
- Plan 03 can use `CONTAMINATION_FAILURE_CODES` for parent lineage guards

## Self-Check: PASSED

- FOUND: app/src/server/ai/factual-visual-separation.ts
- FOUND: .planning/phases/117-factual-vs-visual-separation/117-01-SUMMARY.md
- FOUND: commit a3a05a5b
- FOUND: commit 4dd07445

---
*Phase: 117-factual-vs-visual-separation*
*Completed: 2026-06-15*
