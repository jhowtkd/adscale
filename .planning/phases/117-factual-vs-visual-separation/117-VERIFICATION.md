---
phase: 117-factual-vs-visual-separation
verified: 2026-06-15T13:32:00Z
status: passed
score: 13/13
overrides_applied: 0
deferred:
  - truth: "Live image generation no longer copies athletes/brands from style reference"
    addressed_in: "Phase 122"
    evidence: "117-VALIDATION.md defers SEP-02 live-render check to Phase 122 Regression Test Suite (requires OpenAI image generation)"
  - truth: "Four remaining corpus archetypes (visual_overload, generic_template_aesthetic, format_campaign_drift, restyling_factual_contamination) gate to invalid"
    addressed_in: "Phase 120"
    evidence: "Phase 120 success criteria: novas categorias bloqueantes; corpus fixtures 27069645, a753e357, etc. blocked after correction"
---

# Phase 117: Factual vs Visual Separation Verification Report

**Phase Goal:** Factual vs Visual Separation — classificação de inputs; referência visual só transfere linguagem abstrata; bloqueio de entidades inventadas

**Verified:** 2026-06-15T13:32:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Inputs classificados explicitamente (base factual, referência visual, brand kit, referências auxiliares) | ✓ VERIFIED | `buildInputClassificationPromptSection` emits `INPUT SOURCE CLASSIFICATION:` with all four roles; tests in `prompt-builder.test.ts` (12 passed) |
| 2 | `inputSourceClassification` persistido no contrato pelo job de derivação | ✓ VERIFIED | `derivation.ts` L488-495 populates `resolvedContract.inputSourceClassification`; `creative-contract.ts` L68 optional field; derivation tests confirm persistence |
| 3 | Classificação aparece após integridade e antes dos blocos MODE (art_variation, format_adaptation, restyling) | ✓ VERIFIED | `prompt-builder.test.ts` parametrized test for all three modes; integrityIdx < classificationIdx < modeIdx |
| 4 | Restyling inclui VISUAL REFERENCE TRANSFER RULE com allowlist/denylist SEP-02 | ✓ VERIFIED | `factual-visual-separation.ts` L95-114; restyling regression + 4 visual-transfer tests pass |
| 5 | Restyling nunca inclui Extracted Visual Token Brief | ✓ VERIFIED | `prompt-builder.ts` L587-589 guards `generationMode !== "restyling"`; regression test asserts absence |
| 6 | RESTYLING FACTUAL-SOURCE RULE injeta para todo restyling independente de styleAssetId | ✓ VERIFIED | `prompt-builder.ts` L429-435 gated on `generationMode === "restyling"` only; test at L996 confirms null styleAssetId |
| 7 | format_adaptation rejeita parent com qualityVerdict invalid | ✓ VERIFIED | `parentHasContamination` L224; derivation + unit tests throw on invalid parent |
| 8 | format_adaptation rejeita parent com hardFailures em CONTAMINATION_FAILURE_CODES | ✓ VERIFIED | `parentHasContamination` checks Set membership (copied_style_reference_facts, wrong_brand, unsupported_offer, invented_factual_entity); derivation tests cover copied_style_reference_facts and wrong_brand |
| 9 | Erro lançado antes de download do buffer do parent contaminado | ✓ VERIFIED | `derivation.ts` L498-500 `assertParentFactualLineage` precedes L502-504 `downloadBuffer`; integration test confirms download not called |
| 10 | Delivery package continua bloqueando derivações não aprováveis | ✓ VERIFIED | `delivery-package/route.test.ts` — 9/9 tests pass |
| 11 | Gate promove entidades inventadas (Cantona, Manchester United, Adidas) para invented_factual_entity | ✓ VERIFIED | `creative-quality-gate.ts` L108-114, L168-174 via `INVENTED_ENTITY_PATTERN`; 2 gate tests pass |
| 12 | corpus-invented-factual-entity baseline passa com verdict invalid | ✓ VERIFIED | `corpus-baseline.test.ts` uses `it` (not `it.fails`) for invented_factual_entity archetype; `baselineVerdict: "invalid"` in fixture |
| 13 | CENBRAP NR1 resolve allowed entities e injeta ALLOWED ENTITIES; invariantIdentity populado | ✓ VERIFIED | `resolveAllowedEntitiesForCampaign` + `buildAllowedEntitiesPromptSection` wired in `prompt-builder.ts` L413-416; `canonical-creative-contract.ts` L83-113 merges brands/people; prompt test L1037 confirms CENBRAP in prompt |

**Score:** 13/13 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Live render no longer copies style-reference athletes/brands | Phase 122 | 117-VALIDATION.md: requires OpenAI image generation; deferred to regression suite |
| 2 | Four remaining corpus archetypes gate to invalid | Phase 120 | `BASELINE_GAP_COUNT = 4` in corpus-baseline.test.ts; Phase 120 GATE hardening |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/ai/factual-visual-separation.ts` | Classification, transfer rule, contamination codes, lineage guard | ✓ VERIFIED | 236 lines; all exports present |
| `app/src/server/ai/creative-contract.ts` | `inputSourceClassification` on contract | ✓ VERIFIED | Optional field L68 |
| `app/src/server/ai/prompt-builder.ts` | Classification, allowed entities, transfer rule, restyling guards | ✓ VERIFIED | Wired L404-435, L587-589 |
| `app/src/server/jobs/derivation.ts` | Classification persistence + lineage guard | ✓ VERIFIED | L488-500 |
| `app/src/server/ai/creative-quality-gate.ts` | invented_factual_entity promotion | ✓ VERIFIED | Code type + classifyBriefMatchFailed/classifyCreativeRiskFailed |
| `app/src/server/ai/creative-corpus.ts` | Campaign slug match + allowed entities resolver | ✓ VERIFIED | matchCanonicalCampaignSlug, resolveAllowedEntitiesForCampaign |
| `app/tests/unit/ai/corpus-baseline.test.ts` | invented_factual_entity flip green | ✓ VERIFIED | it (not it.fails) for archetype |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| prompt-builder.ts | factual-visual-separation.ts | buildInputClassificationPromptSection | ✓ WIRED | gsd-tools verified; L411 |
| derivation.ts | factual-visual-separation.ts | resolveInputSourceClassification | ✓ WIRED | gsd-tools verified; L488 |
| prompt-builder.ts | buildVisualReferenceTransferRuleSection | restyling mode | ✓ WIRED | gsd-tools verified; L418-426 |
| prompt-builder.ts | visualTokenBrief | skip for restyling | ✓ WIRED | L587-589 guard |
| derivation.ts | assertParentFactualLineage | before downloadBuffer | ✓ WIRED | gsd-tools verified; L498-504 order |
| derivation.ts | CONTAMINATION_FAILURE_CODES | parent hardFailures check | ✓ WIRED | Indirect via parentHasContamination in factual-visual-separation.ts (gsd-tools false negative — no direct import in derivation.ts) |
| creative-quality-gate.ts | INVENTED_ENTITY_PATTERN | classifyBriefMatchFailed / classifyCreativeRiskFailed | ✓ WIRED | gsd-tools verified |
| prompt-builder.ts | buildAllowedEntitiesPromptSection | after classification | ✓ WIRED | L413-416 (gsd-tools false negative on "ALLOWED ENTITIES" pattern) |
| corpus-baseline.test.ts | corpus-invented-factual-entity | it (green) | ✓ WIRED | gsd-tools verified |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| prompt-builder classification block | `classification` | `resolveInputSourceClassification(contract, ctx)` from contract fields + brandKit/clientReferences | Yes — derives from styleAssetId, sourcePackage, hasBrandKit, clientReferenceCount | ✓ FLOWING |
| prompt-builder ALLOWED ENTITIES | `allowedEntities` | `resolveAllowedEntitiesForCampaign(campaign)` → CANONICAL_CAMPAIGNS registry | Yes — CENBRAP NR1 test confirms CENBRAP brand injected | ✓ FLOWING |
| derivation job lineage guard | `parentDerivation` | `getDerivationById(parentId)` qualityVerdict + hardFailures | Yes — throws on copied_style_reference_facts before download | ✓ FLOWING |
| creative-quality-gate | `hardFailures` | QA checklist notes matched against INVENTED_ENTITY_PATTERN | Yes — Cantona fixture promotes to invented_factual_entity | ✓ FLOWING |
| canonical-creative-contract | `invariantIdentity.people/brands` | `resolveAllowedEntitiesForCampaign` when slug matches | Yes — brands merged with contract.client | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| SEP-01 input classification | `npm test -- prompt-builder.test.ts -t "input classification"` | 12 passed | ✓ PASS |
| SEP-01 job persistence | `npm test -- derivation.test.ts -t "input classification"` | 5 passed | ✓ PASS |
| SEP-02 visual transfer | `npm test -- prompt-builder.test.ts -t "visual reference transfer"` | 4 passed | ✓ PASS |
| SEP-02 restyling regression | `npm test -- quality-prompt-regression.test.ts -t "restyling"` | 1 passed | ✓ PASS |
| SEP-03 contaminated parent | `npm test -- derivation.test.ts -t "contaminated parent"` | 3 passed | ✓ PASS |
| SEP-03 delivery package | `npm test -- delivery-package/route.test.ts` | 9 passed | ✓ PASS |
| SEP-04 invented_factual_entity gate | `npm test -- creative-quality-gate.test.ts -t "invented_factual_entity"` | 2 passed | ✓ PASS |
| SEP-04 allowed entities | `npm test -- creative-corpus.test.ts -t "allowed entit"` | 1 passed | ✓ PASS |
| SEP-04 corpus baseline flip | `npm test -- corpus-baseline.test.ts -t "corpus-invented-factual-entity"` | 2 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SEP-01 | 117-01 | Inputs classificados: base factual, referência visual, brand kit, referências adicionais | ✓ SATISFIED | Classification module + prompt + job persistence |
| SEP-02 | 117-02 | Referência visual transfere só atributos abstratos; nunca pessoas/marcas/textos/alegações | ✓ SATISFIED | VISUAL REFERENCE TRANSFER RULE + visualTokenBrief guard + unconditional RESTYLING FACTUAL-SOURCE RULE |
| SEP-03 | 117-03 | Derivação contaminada não alimenta adaptações de formato | ✓ SATISFIED | assertParentFactualLineage before parent download; delivery-package guard intact |
| SEP-04 | 117-04 | Cantona/Manchester United/Adidas ausentes da fonte bloqueados no gate | ✓ SATISFIED | invented_factual_entity hard failure + ALLOWED ENTITIES prompt + corpus baseline green |

No orphaned requirements — all four SEP IDs declared in plans and mapped in REQUIREMENTS.md Phase 117.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found in phase artifacts | — | — |

Scanned `factual-visual-separation.ts`, `prompt-builder.ts`, `derivation.ts`, `creative-quality-gate.ts`, `creative-corpus.ts` — no TODO/FIXME/placeholder stubs; no empty handlers or hardcoded empty returns in production paths.

### Human Verification Required

None — all phase deliverables are prompt/gate/job-level and covered by unit tests. Live image-generation behavior is explicitly deferred to Phase 122 per 117-VALIDATION.md.

### Gaps Summary

No gaps found. Phase 117 goal achieved: factual vs visual inputs are classified, visual references are constrained to abstract style transfer, contaminated lineage is blocked for format adaptation, and invented factual entities are promoted to hard failures at the quality gate.

---

_Verified: 2026-06-15T13:32:00Z_
_Verifier: Claude (gsd-verifier)_
