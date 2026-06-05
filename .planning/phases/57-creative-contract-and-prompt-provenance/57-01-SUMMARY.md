---
phase: 57-creative-contract-and-prompt-provenance
plan: "01"
subsystem: database
tags: [drizzle, jsonb, creative-contract, prompt-provenance, derivation-job, vitest]

requires: []
provides:
  - Durable creative_contract and prompt_provenance JSONB columns on derivations
  - Serializable SourcePackage, source descriptors, and PromptProvenance types
  - Workspace-scoped updateDerivationPromptProvenance repository helper
  - Derivation job wiring that resolves contract before prompt build and persists provenance
affects:
  - 57-02 prompt contract regression coverage
  - phases 58-60 scoring, QA, and regeneration that consume contract history

tech-stack:
  added: []
  patterns:
    - "Repository helper for workspace-scoped provenance updates"
    - "Immutable resolved contract before buildDerivationPrompt"
    - "Two-phase provenance write: pre-generation and post-OpenAI"

key-files:
  created:
    - app/drizzle/0027_creative_contract_provenance.sql
  modified:
    - app/src/server/ai/creative-contract.ts
    - app/src/server/db/schema.ts
    - app/src/server/repositories/derivation.ts
    - app/src/server/repositories/derivation.test.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/jobs/derivation.test.ts

key-decisions:
  - "Kept CreativeContract canonical; added SourcePackage, source descriptors, and PromptProvenance as supporting serializable types"
  - "Resolved baseAssetId and styleAssetId before prompt build; approved_derivation package uses source descriptor instead of overloading baseAssetId"
  - "Persist provenance via repository helper rather than direct DB updates in the job"

patterns-established:
  - "Pattern: updateDerivationPromptProvenance scopes updates by id + workspaceId"
  - "Pattern: promptProvenance records imageOperation (edit | generation_fallback | generate) after OpenAI returns"

requirements-completed: [AIC-01, AIC-05]

duration: 12min
completed: 2026-06-05
---

# Phase 57 Plan 01: Persist Creative Contract and Prompt Provenance Summary

**Durable JSONB contract/provenance on derivations with workspace-scoped repository persistence and derivation-job wiring before prompt build**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-05T13:25:00Z
- **Completed:** 2026-06-05T13:28:00Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments

- Added `creative_contract` and `prompt_provenance` JSONB columns with migration `0027`
- Extended `creative-contract.ts` with `SourcePackage`, source descriptors, `FactualSourceRules`, and `PromptProvenance`
- Added `updateDerivationPromptProvenance` with workspace-scoped tests
- Derivation job resolves source package, asset IDs, and full contract before `buildDerivationPrompt`; persists provenance pre/post generation
- Job tests prove campaign-asset and approved-derivation provenance shapes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add durable contract/provenance fields** - `c413e83` (feat)
2. **Task 2: Add workspace-scoped repository persistence** - `8dfcaa7` (feat)
3. **Task 3: Resolve complete source package and contract before prompt build** - `5c66524` (feat)
4. **Task 4: Run focused persistence verification and build** - verification only (no code commit)

**Plan metadata:** `f9a3346` (docs: complete plan)

## Files Created/Modified

- `app/drizzle/0027_creative_contract_provenance.sql` - Migration adding JSONB columns
- `app/src/server/ai/creative-contract.ts` - Provenance types and factual-source rules
- `app/src/server/db/schema.ts` - Drizzle column mappings
- `app/src/server/repositories/derivation.ts` - `updateDerivationPromptProvenance` helper
- `app/src/server/repositories/derivation.test.ts` - Repository persistence tests
- `app/src/server/jobs/derivation.ts` - Contract resolution and provenance persistence
- `app/src/server/jobs/derivation.test.ts` - Job provenance assertions

## Decisions Made

- Kept `CreativeContract` as the canonical type; added optional `sourcePackage` and `factualSourceRules` fields on the persisted contract
- For approved-derivation format adaptation, `baseAssetId` stays `null`; parent identity lives in `source` descriptor
- Restyling resolves base/style asset IDs before prompt build and no longer mutates contract inside the image branch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AIC-01 and AIC-05 satisfied at persistence layer; plan 57-02 can add prompt-builder regression coverage using finalized contract/source-package shapes
- Apply migration `0027_creative_contract_provenance.sql` on deployed databases before relying on new columns

---
*Phase: 57-creative-contract-and-prompt-provenance*
*Completed: 2026-06-05*

## Self-Check: PASSED

- FOUND: app/drizzle/0027_creative_contract_provenance.sql
- FOUND: app/src/server/ai/creative-contract.ts
- FOUND: app/src/server/repositories/derivation.ts
- FOUND: app/src/server/jobs/derivation.ts
- FOUND: c413e83
- FOUND: 8dfcaa7
- FOUND: 5c66524
