---
phase: 121-score-ceilings-and-retry
verified: 2026-06-15T19:53:00Z
status: passed
score: 5/5
overrides_applied: 0
re_verification: false
---

# Phase 121: Score Ceilings and Retry Verification Report

**Phase Goal:** Nota alta não mascara falhas factuais; retry de restyling sempre parte da fonte factual original com correção específica ao defeito.

**Verified:** 2026-06-15T19:53:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Score separa integridade factual, hierarquia, legibilidade, direção de arte, originalidade e adequação ao formato (SCR-01) | ✓ VERIFIED | `buildScoreDimensionMapSection()` in `creative-score.ts` maps six concern buckets to breakdown keys; `creative-score.test.ts` asserts SCR-01 block in prompt |
| 2 | Tetos de nota aplicados: fato inventado ≤20, campanha substituída ≤15, CTA ausente ≤50, overload grave ≤55, variação decorativa ≤60 (SCR-02) | ✓ VERIFIED | `SCORE_CEILING_BY_FAILURE` in `creative-score-ceilings.ts`; 12 unit tests in `creative-score-ceilings.test.ts` assert each ceiling |
| 3 | Nota alta não coexiste com hard failures ativos (SCR-03) | ✓ VERIFIED | `deriveQualityVerdict` returns `invalid` when `hardFailures.length > 0`; `applyScoreCeilings` caps score before verdict/persist; orchestration test caps raw 92 → 50 on `cta_drift` |
| 4 | Retry habilitado para restyling usa fonte factual original, nunca saída contaminada (SCR-04) | ✓ VERIFIED | `derivation.ts` L946–969 resolves `baseAsset.key` / `styleAsset.key` for restyling retry (never `generated.outputKey`); policy enables `style_reference_contamination`; two-image `images.edit` in `derivation-auto-retry.ts` |
| 5 | Correção de retry é específica: remover entidade inventada, restaurar pessoa/marca, reduzir módulos, restaurar conceito/CTA (SCR-05) | ✓ VERIFIED | `FAILURE_CORRECTION_DIRECTIVES` with 10 imperative lines; `formatIssueSections` prepends `Correction directives:`; restyling brief appends `RESTYLING FACTUAL-SOURCE RULE` via `buildRestylingFactualSourceRuleSection()` |

**Score:** 5/5 roadmap truths verified

### Plan Must-Haves (121-01 / 121-02 / 121-03)

| Plan | Must-have truth | Status | Evidence |
|------|-----------------|--------|----------|
| 01 | Persisted qualityScore never exceeds SCR-02 ceiling when hard failure active | ✓ VERIFIED | `runCompletedDerivationQualityGate` calls `updateDerivationScore` with `cappedQualityScore` when `hardFailures.length > 0` |
| 01 | Raw model score 85 + invented_factual_entity capped ≤20 | ✓ VERIFIED | `creative-score-ceilings.test.ts` + `creative-quality-gate.test.ts` |
| 01 | Score prompt documents six SCR-01 concern buckets | ✓ VERIFIED | `buildScoreDimensionMapSection()` L219–228 |
| 01 | deriveQualityVerdict invalid when hardFailures present | ✓ VERIFIED | `creative-quality-gate.ts` L663–664 |
| 02 | Restyling + style_reference_contamination eligible for auto-retry | ✓ VERIFIED | `derivation-auto-retry-policy.test.ts` |
| 02 | Restyling retry uses original base asset key, not outputKey | ✓ VERIFIED | `derivation.ts` restyling branch sets `referenceKey = baseAsset.key` |
| 02 | Restyling retry uses two-image images.edit path | ✓ VERIFIED | `derivation-auto-retry.ts` L84–95; `derivation-auto-retry.integration.test.ts` |
| 02 | invented_factual_entity and campaign_identity_drift NOT auto-retried | ✓ VERIFIED | Policy tests assert false for both codes |
| 02 | autoRetryAttempted single-shot guard unchanged | ✓ VERIFIED | `shouldAutoRetryDerivation` returns false when `autoRetryAttempted` is true |
| 03 | Correction brief includes imperative directive per hard-failure code | ✓ VERIFIED | `FAILURE_CORRECTION_DIRECTIVES` + `getFailureCorrectionDirectives` |
| 03 | style_reference_contamination brief: style only, facts from base | ✓ VERIFIED | Directive L27–28; test at `regeneration-correction-brief.test.ts` L151 |
| 03 | Restyling correction brief includes RESTYLING FACTUAL-SOURCE RULE | ✓ VERIFIED | `buildRegenerationCorrectionBrief` L295–302; tests L255–277 |
| 03 | invented_factual_entity brief instructs remove entities not in registry | ✓ VERIFIED | Directive L17–18; test L113 |

**Plan must-haves:** 13/13 verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/server/ai/creative-score-ceilings.ts` | SCR-02 ceiling table + applyScoreCeilings | ✓ VERIFIED | 125 lines; exports `SCORE_CEILING_BY_FAILURE`, `applyScoreCeilings` |
| `app/src/server/ai/creative-quality-gate.ts` | Gate invokes ceilings before verdict/persist | ✓ VERIFIED | `applyScoreCeilings` at L637; persist capped score L753–767 |
| `app/tests/unit/ai/creative-score-ceilings.test.ts` | SCR-02 matrix tests | ✓ VERIFIED | 12 tests |
| `app/src/server/ai/derivation-auto-retry-policy.ts` | Mode-aware shouldAutoRetryDerivation | ✓ VERIFIED | `RETRYABLE_BY_MODE` per generation mode |
| `app/src/server/jobs/derivation.ts` | Restyling retry wiring | ✓ VERIFIED | Restyling skip removed; factual asset resolution |
| `app/src/server/ai/derivation-auto-retry.ts` | Two-image restyling edit | ✓ VERIFIED | `styleReferenceKey` + `[base, style]` array |
| `app/src/server/ai/regeneration-correction-brief.ts` | FAILURE_CORRECTION_DIRECTIVES | ✓ VERIFIED | 10 codes mapped; directive section prepended |
| `app/tests/unit/ai/regeneration-correction-brief.test.ts` | SCR-05 specificity tests | ✓ VERIFIED | 21 tests (per summary) |

gsd-tools artifact verification: **8/8 passed** across three plans.

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `creative-quality-gate.ts` | `creative-score-ceilings.ts` | applyScoreCeilings after classify | ✓ WIRED | Import L40; call L637 |
| `creative-quality-gate.ts` | updateDerivationScore | persist capped qualityScore | ✓ WIRED | L760–767 `qualityScore: cappedQualityScore` |
| `derivation.ts` | `derivation-auto-retry-policy.ts` | shouldAutoRetryDerivation | ✓ WIRED | L928; re-export from auto-retry module |
| `derivation.ts` | `derivation-auto-retry.ts` | baseAsset.key + styleAsset.key | ✓ WIRED | L966–968 → `runDerivationAutoRetry` |
| `derivation.ts` | `regeneration-correction-brief.ts` | correctionFeedback from regenerationSuggestion | ✓ WIRED | L932–938 |
| `creative-score.ts` | `regeneration-correction-brief.ts` | buildHardFailureRegenerationSuggestion | ✓ WIRED | gsd-tools verified |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `computeQualityGateFromAnalysis` | `qualityScore` | `row.qualityScore` + `classifyCreativeQualityGate` hardFailures | Yes — ceilings applied from failure codes | ✓ FLOWING |
| Restyling auto-retry | `referenceKey` | `getAssetsByCampaign` → `baseAsset.key` | Yes — contract-resolved campaign assets | ✓ FLOWING |
| Correction brief | `promptFeedback` | `FAILURE_CORRECTION_DIRECTIVES` + hard failure list | Yes — imperative directives per code | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SCR-02 ceiling matrix | `npm test -- creative-score-ceilings.test.ts` | 12/12 passed | ✓ PASS |
| Gate caps score on hard failure | `npm test -- creative-quality-gate.test.ts creative-quality-gate-orchestration.test.ts` | passed | ✓ PASS |
| Mode-aware retry policy | `npm test -- derivation-auto-retry-policy.test.ts` | 9/9 passed | ✓ PASS |
| SCR-05 correction directives | `npm test -- regeneration-correction-brief.test.ts` | 21/21 passed | ✓ PASS |
| Restyling job retry wiring | `npm test -- derivation.test.ts` | passed | ✓ PASS |
| Two-image restyling edit | `npm test -- derivation-auto-retry.integration.test.ts` | passed | ✓ PASS |
| Corpus regression baseline | `npm test -- corpus-baseline.test.ts` | 14/14 passed | ✓ PASS |

**Combined phase 121 test run:** 7 files, 144 passed; + orchestration/corpus: 160 total passed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SCR-01 | 121-01 | Six-dimension score separation | ✓ SATISFIED | `buildScoreDimensionMapSection()` |
| SCR-02 | 121-01 | Failure-specific score ceilings | ✓ SATISFIED | `creative-score-ceilings.ts` + tests |
| SCR-03 | 121-01 | No high score with active hard failures | ✓ SATISFIED | Verdict invalid + capped persist |
| SCR-04 | 121-02 | Restyling retry from factual original | ✓ SATISFIED | Job wiring + policy + integration test |
| SCR-05 | 121-03 | Failure-specific correction directives | ✓ SATISFIED | `FAILURE_CORRECTION_DIRECTIVES` + restyling rule |

No orphaned requirement IDs — all five SCR requirements claimed in plans and implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None in phase 121 key files | — | — |

Scanned `creative-score-ceilings.ts`, `creative-quality-gate.ts`, `derivation-auto-retry-policy.ts`, `derivation-auto-retry.ts`, `regeneration-correction-brief.ts`, `derivation.ts` — no TODO/FIXME stubs, empty handlers, or hardcoded empty data paths affecting user-visible output.

### Human Verification Required

None — server-side scoring, gating, retry policy, and correction brief logic are fully covered by unit and integration tests. No visual or external-service behavior requires manual confirmation for phase goal achievement.

### Gaps Summary

No gaps found. All roadmap success criteria, plan must-haves, artifacts, key links, and requirement IDs are implemented and verified with passing tests. Phase 121 goal achieved.

---

_Verified: 2026-06-15T19:53:00Z_  
_Verifier: Claude (gsd-verifier)_
