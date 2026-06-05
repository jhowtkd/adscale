---
phase: "45"
plan: "04"
subsystem: ai-pipeline
tags: [derivation-job, creative-contract, restyling, bug-fix]
one_liner: "CreativeContract wired through derivation job (single resolution, restyling bug fixed) and QA route; all pipeline functions now receive contract"
dependency_graph:
  requires:
    - 45-01 (CreativeContract, resolveCtaSemantics, styleAssetId in event)
    - 45-02 (DerivationPromptConfig.contract, AnalyzeInput.contract)
    - 45-03 (AnalyzeCreativeQaInput.contract)
  provides:
    - derivation.ts: single contract resolution before generate-and-store-output
    - restyling asset selection: uses contract.styleAssetId (REST-01 bug fix)
    - buildDerivationPrompt receives contract
    - scoreCompletedDerivation receives contract → analyzeDerivationCreative receives contract
    - QA route: reconstructs contract, passes to analyzeCreativeQa
  affects: []
tech_stack:
  added: []
  patterns:
    - Single contract resolution point per job run
key_files:
  created: []
  modified:
    - app/src/server/jobs/derivation.ts
    - app/src/app/api/derivations/[id]/qa/route.ts
decisions:
  - "QA route also modified (not in plan files_modified) to satisfy CNTR-02 truth — analyzeCreativeQa receives contract"
  - "contract.baseAssetId set to baseAsset.id after restyling asset resolution"
  - "derivation.styleAssetId accessed via cast (schema type not yet reflecting new column in TS — REST-01)"
  - "scoreCompletedDerivation: contract added as optional 7th parameter to preserve backward compatibility"
metrics:
  duration_seconds: 300
  tasks_completed: 1
  files_changed: 2
  completed_date: "2026-06-01"
---

# Phase 45 Plan 04: Derivation Job Contract Wiring Summary

CreativeContract wired through derivation job (single resolution, restyling bug fixed) and QA route; all pipeline functions now receive contract.

## What Was Built

### derivation.ts changes

1. **Imports**: Added `resolveCtaSemantics` and `CreativeContract` from `../ai/creative-contract`
2. **Event destructure**: Added `styleAssetId` to the `event.data` destructure (line ~211)
3. **Contract resolution** (after lines 304-306):
   ```typescript
   const contract: CreativeContract = {
     generationMode: effectiveGenerationMode as CreativeContract["generationMode"],
     targetFormat,
     ctaSemantics: resolveCtaSemantics(effectiveCtaText ?? null, effectiveGenerationMode),
     baseAssetId: null,         // filled after asset resolution
     styleAssetId: styleAssetId ?? derivation.styleAssetId ?? null,
     client: campaign?.client ?? null,
     product: campaign?.product ?? null,
     offer: campaign?.offer ?? null,
     constraints: null,
   };
   ```
4. **Restyling asset selection bug fix** (REST-01 — lines ~421-428):
   - Before: `assets.find(a => a.role === "style_reference") ?? assets[1]`
   - After: `contract.styleAssetId ? (find by ID ?? find by role) : find by role`
   - Also: `contract.baseAssetId = baseAsset.id` after resolving base asset
5. **buildDerivationPrompt**: added `contract` field
6. **scoreCompletedDerivation**: added `contract?: CreativeContract | null` as optional 7th param
7. **scoreCompletedDerivation body**: passes `contract ?? null` to `analyzeDerivationCreative`
8. **score-derivation step**: passes `contract` to `scoreCompletedDerivation`

### qa/route.ts changes

Reconstructs `CreativeContract` from derivation DB fields and passes to `analyzeCreativeQa`:
```typescript
const qaContract: CreativeContract = {
  generationMode: derivationGenerationMode,
  targetFormat: derivation.format ?? "1:1",
  ctaSemantics: resolveCtaSemantics(derivation.ctaText, derivationGenerationMode),
  baseAssetId: null,
  styleAssetId: derivation.styleAssetId ?? null,
  ...
};
```

## Deviations from Plan

**Rule 2 (auto-add):** QA route (`app/src/app/api/derivations/[id]/qa/route.ts`) was modified to satisfy `must_haves.truths` requiring `analyzeCreativeQa receives contract in its input argument`. The plan listed only `derivation.ts` in `files_modified`, but the QA route is where `analyzeCreativeQa` is called.

## Commits

- `c80b054` feat(45-04): wire CreativeContract through derivation job and QA route

## Self-Check: PASSED

- ✅ derivation.ts imports resolveCtaSemantics and CreativeContract
- ✅ `const contract: CreativeContract = {` block exists in derivation job
- ✅ Restyling branch uses `contract.styleAssetId` for asset lookup
- ✅ buildDerivationPrompt receives contract
- ✅ scoreCompletedDerivation + analyzeDerivationCreative receive contract
- ✅ QA route reconstructs and passes contract to analyzeCreativeQa
- ✅ TypeScript compiles with no errors in target files
