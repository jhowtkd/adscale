---
phase: "45"
plan: "03"
subsystem: ai-pipeline
tags: [creative-qa, style-fidelity, restyling, creative-contract]
one_liner: "styleFidelity QA criterion added to creative-qa.ts — detects factual contamination from style reference in restyling outputs; normalized without crashing non-restyling responses"
dependency_graph:
  requires:
    - 45-01 (CreativeContract, CtaSemantics types)
  provides:
    - CreativeQaCriterion.styleFidelity variant
    - AnalyzeCreativeQaInput.contract field
    - buildCreativeQaPrompt: conditional styleFidelity checklist key + instruction for restyling+styleAssetId
    - normalizeCreativeQaResult: handles styleFidelity without crashing on non-restyling responses
  affects:
    - app/src/server/jobs/derivation.ts (consumer in 45-04)
tech_stack:
  added: []
  patterns:
    - Conditional checklist key injection based on contract mode
key_files:
  created: []
  modified:
    - app/src/server/ai/creative-qa.ts
decisions:
  - "styleFidelity only appended to checklist keys when isRestyling AND hasStyleRef — avoids confusing non-restyling QA responses"
  - "normalizeCreativeQaResult: styleFidelity only written to checklist if model returned it (no phantom 'Needs a quick manual review' fallback)"
  - "styleFidelity instruction: failed=contamination detected; warning=uncertain; passed=all facts from base image"
metrics:
  duration_seconds: 120
  tasks_completed: 1
  files_changed: 1
  completed_date: "2026-06-01"
---

# Phase 45 Plan 03: styleFidelity QA Criterion Summary

styleFidelity QA criterion added to creative-qa.ts — detects factual contamination from style reference in restyling outputs; normalized without crashing non-restyling responses.

## What Was Built

**creative-qa.ts changes:**

1. `CreativeQaCriterion` union: added `"styleFidelity"` variant
2. `AnalyzeCreativeQaInput`: added `contract?: CreativeContract | null`
3. `buildCreativeQaPrompt`:
   - Detects `isRestyling` from `contract.generationMode` or `derivation.generationMode`
   - Detects `hasStyleRef` from `contract.styleAssetId`
   - When `isRestyling && hasStyleRef`: appends `styleFidelity` to checklist keys and adds instruction for factual contamination check
   - Otherwise: standard 6-key checklist, no styleFidelity instruction
4. `normalizeCreativeQaResult`:
   - Reads `input.checklist?.["styleFidelity"]` — only writes to checklist if model returned it
   - Does NOT add phantom "Needs a quick manual review" fallback for styleFidelity (prevents false positives on non-restyling QA)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `f211a86` feat(45-03): add styleFidelity QA criterion for restyling mode

## Self-Check: PASSED

- ✅ `CreativeQaCriterion` includes `"styleFidelity"`
- ✅ `AnalyzeCreativeQaInput.contract` field added
- ✅ `buildCreativeQaPrompt` appends styleFidelity key only for restyling + styleAssetId
- ✅ `normalizeCreativeQaResult` handles styleFidelity without crashing
- ✅ TypeScript compiles with no errors in target files
