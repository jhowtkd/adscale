---
phase: "45"
plan: "02"
subsystem: ai-pipeline
tags: [prompt-builder, creative-score, creative-contract, cta-semantics]
one_liner: "CreativeContract threaded into prompt-builder (mode-aware CTA rules + factual-source rule) and creative-score (contract-aware CTA scoring + restyling informationPreservation + asset IDs in suggestions)"
dependency_graph:
  requires:
    - 45-01 (CreativeContract, CtaSemantics types)
  provides:
    - DerivationPromptConfig.contract field
    - buildHardRulesSection: mode-aware CTA instructions (explicit/inherited/legacy)
    - restyling factual-source prompt rule when contract.styleAssetId set
    - AnalyzeInput.contract field
    - analyzeDerivationCreative: contract-aware CTA scoring
    - BuildSuggestionInput.contract field
    - buildRegenerationSuggestion: embeds baseAssetId + styleAssetId for restyling
  affects:
    - app/src/server/jobs/derivation.ts (consumer in 45-04)
tech_stack:
  added: []
  patterns:
    - Discriminated union dispatch on ctaSemantics.kind
key_files:
  created: []
  modified:
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/creative-score.ts
decisions:
  - "ctaSemantics dispatch: explicit → literal rule; inherited → mode-specific preservation rule; absent/no-contract → legacy ctaText fallback"
  - "Restyling factual-source rule only appended when contract.styleAssetId is present (not all restyling)"
  - "Restyling scoring instruction appended to score prompt regardless of styleAssetId (mode check only)"
  - "buildRegenerationSuggestion embeds asset IDs for contract reconstruction in downstream flows"
metrics:
  duration_seconds: 240
  tasks_completed: 2
  files_changed: 2
  completed_date: "2026-06-01"
---

# Phase 45 Plan 02: Prompt-Builder + Creative-Score Contract Threading Summary

CreativeContract threaded into prompt-builder (mode-aware CTA rules + factual-source rule) and creative-score (contract-aware CTA scoring + restyling informationPreservation + asset IDs in suggestions).

## What Was Built

### Task 1: prompt-builder.ts

- Added `import type { CreativeContract, CtaSemantics } from "./creative-contract"`
- `DerivationPromptConfig`: added `contract?: CreativeContract | null`
- `buildHardRulesSection`: extended signature with `generationMode` and `ctaSemantics`; dispatches on `ctaSemantics.kind`:
  - `explicit` → literal CTA rule with exact text
  - `inherited` + `format_adaptation` → "Preserve the CTA exactly as it appears in the source creative"
  - `inherited` + `restyling` → "base image CTA must be preserved; do not replace with style reference text"
  - `inherited` (other) → "Use the original CTA from the reference creative"
  - no contract → legacy `ctaText` fallback
- `buildDerivationPrompt`: destructures `contract`; passes `ctaSemantics` and `generationMode` to `buildHardRulesSection`; appends RESTYLING FACTUAL-SOURCE RULE when `contract?.styleAssetId` is set

### Task 2: creative-score.ts

- Added `import type { CreativeContract } from "./creative-contract"`
- `AnalyzeInput`: added `contract?: CreativeContract | null`
- `analyzeDerivationCreative`: builds `ctaInstruction` from `contract.ctaSemantics`:
  - `explicit` → "exact CTA must remain: <text>. Penalize if absent or replaced"
  - `inherited` → "preserve a CTA element; do NOT penalize for missing explicit CTA text"
  - no contract → legacy `input.derivation.ctaText` fallback
- `restylingScoringInstruction`: appended to prompt when mode is restyling — instructs scorer to check `informationPreservation` against base image only
- `BuildSuggestionInput`: added `contract?: CreativeContract | null`
- `buildRegenerationSuggestion`: appends `Base asset: <id>` and `Style reference: <id>` for restyling suggestions

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `bae9293` feat(45-02): thread CreativeContract into prompt-builder and creative-score

## Self-Check: PASSED

- ✅ `DerivationPromptConfig.contract` field added to prompt-builder.ts
- ✅ `buildHardRulesSection` dispatches on ctaSemantics.kind
- ✅ Restyling factual-source rule appended when contract.styleAssetId is set
- ✅ `AnalyzeInput.contract` field added to creative-score.ts
- ✅ `buildRegenerationSuggestion` embeds asset IDs for restyling
- ✅ TypeScript compiles with no errors in target files
