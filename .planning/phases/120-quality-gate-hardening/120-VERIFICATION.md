---
phase: 120-quality-gate-hardening
verified: 2026-06-15T19:15:00Z
status: passed
score: 5/5
overrides_applied: 0
human_verification_approved: 2026-06-15
human_verification:
  - test: "Spot-check hard-failure labels in review drawer (en + pt-BR)"
    expected: "New GATE-01 codes (e.g. invented_factual_entity, campaign_identity_drift, generic_template_aesthetic) render human-readable labels via hardFailureCodes.* in DerivationReviewSheet / DerivationCard — not raw i18n keys"
    status: approved
---

# Phase 120: Quality Gate Hardening Verification Report

**Phase Goal:** Peças factualmente incorretas ou esteticamente genéricas severas não passam para exportação — independentemente da nota estética.

**Verified:** 2026-06-15T19:15:00Z  
**Status:** passed  
**Re-verification:** No — human UI spot-check approved 2026-06-15

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Nine GATE-01 blocking categories active in type union and classifiers | ✓ VERIFIED | `CreativeHardFailureCode` includes all nine codes (`creative-quality-gate.ts:41-54`); each promoted in `classifyCreativeRiskFailed`, `classifyBriefMatchFailed`, `classifyScoreIssue`, or `styleFidelity`/`formatFit` branches; `CREATIVE_HARD_FAILURE_CODES` set matches union |
| 2 | Factual failure yields `invalid` regardless of aesthetic score (GATE-02) | ✓ VERIFIED | `deriveQualityVerdict` returns `"invalid"` when `hardFailures.length > 0` before score check (`creative-quality-gate.ts:646-648`); tests at `creative-quality-gate.test.ts` GATE-02 suite pass with qualityScore 85/88/92 |
| 3 | Severe generic/overload/missing-dominant-idea blocks export — not polish-only (GATE-03) | ✓ VERIFIED | `classifyCreativeRiskFailed` promotes `OVERLOAD_NOTE_MARKERS`, `GENERIC_TEMPLATE_NOTE_MARKERS`, `MISSING_DOMINANT_IDEA_MARKERS` before `pushUnique(polishSuggestions)` (`creative-quality-gate.ts:267-310`); mild subjective generic stays polish (`test.ts:149-161`); severe template hard-fails (`test.ts:247-257`) |
| 4 | Corpus audit IDs 27069645, a753e357, 538246da, a5f65b85, f420bcb2, d7d9d323 blocked (GATE-04) | ✓ VERIFIED | All six IDs in fixture `corpusRefIds` (`corpus-fixtures.ts`); `PRIMARY_AUDIT_CORPUS_IDS` coverage test passes; five negative archetypes produce `invalid` at qualityScore 85; `BASELINE_GAP_COUNT = 0` |
| 5 | Faithful c2c12774 remains export-approvable with optional warnings (GATE-05) | ✓ VERIFIED | `CORPUS_POSITIVE_FIXTURES` faithful fixture with `expectedHardFailureCodes: []`, `expectedVerdict: "improvable"`; baseline + GATE-05 guard tests confirm no promotion from warning notes; `assertDerivationApprovable` returns `ok: true` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/ai/creative-quality-taxonomy.ts` | GATE-01 patterns + rubric re-exports | ✓ VERIFIED | Patterns for drift, replaced-subject, decorative-only; re-exports `OVERLOAD_NOTE_MARKERS`, `GENERIC_TEMPLATE_NOTE_MARKERS`, `MISSING_DOMINANT_IDEA_MARKERS` from `observable-rubric.ts:105-109` |
| `app/src/server/ai/creative-quality-gate.ts` | Extended union, classifiers, deriveQualityVerdict | ✓ VERIFIED | 757 lines; promote-before-polish ordering; `normalizeHardFailureCode` aliases legacy codes |
| `app/src/server/ai/factual-visual-separation.ts` | CONTAMINATION_FAILURE_CODES | ✓ VERIFIED | Includes `style_reference_contamination`, `campaign_identity_drift`, `invented_factual_entity`, `replaced_source_subject`, `unauthorized_brand_or_ip` |
| `app/messages/en.json` | hardFailureCodes for all GATE-01 codes | ✓ VERIFIED | All nine new codes present at `en.json:1405-1414` plus legacy `copied_style_reference_facts` |
| `app/messages/pt-BR.json` | hardFailureCodes for all GATE-01 codes | ✓ VERIFIED | Matching pt-BR labels at `pt-BR.json:1406-1415` |
| `app/src/server/ai/corpus-fixtures.ts` | Aligned fixtures + faithful positive | ✓ VERIFIED | Five negative archetypes with canonical codes; `CORPUS_POSITIVE_FIXTURES` with c2c12774 |
| `app/tests/unit/ai/corpus-baseline.test.ts` | BASELINE_GAP_COUNT=0, no it.fails | ✓ VERIFIED | `BASELINE_GAP_COUNT = 0`; uses `it` (not `it.fails`) for all baseline tests |
| `app/tests/unit/ai/creative-quality-gate.test.ts` | GATE-01–05 test suites | ✓ VERIFIED | Describes GATE-01 patterns, GATE-02 score override, GATE-05 faithful guards |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `creative-quality-taxonomy.ts` | `observable-rubric.ts` | re-export markers | ✓ WIRED | `export { OVERLOAD_NOTE_MARKERS, ... } from "./observable-rubric"` |
| `classifyCreativeRiskFailed` | taxonomy markers | noteMatches before polish | ✓ WIRED | Overload/generic/missing/decorative/style-contamination promoted before `pushUnique(polishSuggestions)` |
| `classifyBriefMatchFailed` / `formatFit` | `CAMPAIGN_IDENTITY_DRIFT_PATTERN` | drift before layout default | ✓ WIRED | `hasCampaignIdentityDrift(note)` checked in both paths (`creative-quality-gate.ts:179-188`, `521-536`) |
| `styleFidelity failed` | `style_reference_contamination` | direct pushHardFailure | ✓ WIRED | `creative-quality-gate.ts:513-518` emits canonical code (not `copied_style_reference_facts`) |
| `deriveQualityVerdict` | `hardFailures` array | length > 0 → invalid | ✓ WIRED | Score threshold only evaluated when `hardFailures.length === 0` |
| `corpus-baseline.test.ts` | `classifyCreativeQualityGate` + `deriveQualityVerdict` | runCorpusGatePipeline @ score 85 | ✓ WIRED | Pipeline function at `corpus-baseline.test.ts:35-47` |
| `corpus-faithful-format-adaptation` | `assertDerivationApprovable` | empty hardFailures + improvable | ✓ WIRED | Positive baseline test at `corpus-baseline.test.ts:72-82` |
| `DerivationReviewSheet` / `DerivationCard` | `hardFailureCodes.*` i18n | `tr(\`hardFailureCodes.${code}\`)` | ✓ WIRED | Components reference i18n keys; visual rendering needs human spot-check |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `classifyCreativeQualityGate` | `hardFailures` | checklist `status === "failed"` notes matched against taxonomy patterns | Yes — corpus fixtures drive real QA notes through pipeline | ✓ FLOWING |
| `deriveQualityVerdict` | `qualityVerdict` | `hardFailures.length` + `qualityScore` + checklist warnings | Yes — invalid when hard failures exist regardless of score 85 | ✓ FLOWING |
| `corpus-baseline.test.ts` | `verdict` | fixture `rawQaModelOutput` → normalize → classify → derive | Yes — five invalid + one improvable paths exercised | ✓ FLOWING |
| `CORPUS_POSITIVE_FIXTURES` | faithful gate result | c2c12774 QA with `creativeRisk: warning` | Yes — warnings stay polish, no hard failures | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| GATE-01–05 unit suites | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/corpus-fixtures.test.ts tests/unit/ai/corpus-baseline.test.ts` | 3 files, 81 tests passed | ✓ PASS |
| BASELINE_GAP_COUNT | grep in corpus-baseline.test.ts | `export const BASELINE_GAP_COUNT = 0` | ✓ PASS |
| All nine codes in union | grep CreativeHardFailureCode | All nine GATE-01 codes present | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| GATE-01 | 120-01, 120-02 | Nine new blocking categories active | ✓ SATISFIED | Type union, taxonomy patterns, classifiers, i18n labels |
| GATE-02 | 120-02 | Factual failure → invalid regardless of aesthetic score | ✓ SATISFIED | `deriveQualityVerdict` hard-failure-first; GATE-02 tests with score 85+ |
| GATE-03 | 120-02 | Severe generic aesthetic blocks export, not polish-only | ✓ SATISFIED | Severe marker promotion; mild generic stays polish (`test.ts:149-161`, `789-803`) |
| GATE-04 | 120-03 | Six corpus audit IDs blocked after correction | ✓ SATISFIED | Fixtures linked; baseline rejects all five negative archetypes; `BASELINE_GAP_COUNT = 0` |
| GATE-05 | 120-03 | Faithful c2c12774 approvable with optional simplification | ✓ SATISFIED | `CORPUS_POSITIVE_FIXTURES`; GATE-05 guard suite; `assertDerivationApprovable` ok |

No orphaned requirements — all five GATE-* IDs declared in plans are satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found in phase artifacts | — | — |

Scanned `creative-quality-gate.ts`, `creative-quality-taxonomy.ts`, `corpus-fixtures.ts`, `factual-visual-separation.ts` — no TODO/FIXME/placeholder stubs affecting gate behavior.

### Deferred Items (Later Phases)

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Numeric score ceilings for failure categories | Phase 121 | ROADMAP Phase 121 SCR-02; RESEARCH explicitly defers score caps — GATE-03 satisfied by hard-failure promotion |
| 2 | Full gate matrix / prompt injection regression suite | Phase 122 | ROADMAP Phase 122 TEST-01–04 |
| 3 | Live vision before/after validation | Phase 123 | ROADMAP Phase 123 QA-18–21 |

### Human Verification Required

### 1. Hard-failure labels in review UI

**Test:** Open a derivation with a GATE-01 hard failure (e.g. `invented_factual_entity` or `generic_template_aesthetic`) in the review drawer; switch locale en ↔ pt-BR.

**Expected:** Human-readable operator labels from `hardFailureCodes.*` — not raw key strings like `hardFailureCodes.invented_factual_entity`.

**Why human:** i18n keys and component wiring verified in code; visual rendering requires browser session.

### Gaps Summary

No automated gaps found. All five roadmap success criteria and all five requirement IDs (GATE-01 through GATE-05) are satisfied in code with passing unit tests (81/81). Human UI label spot-check approved.

---

_Verified: 2026-06-15T19:15:00Z_  
_Verifier: Claude (gsd-verifier)_
