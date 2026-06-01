---
phase: 45-creative-contract-and-restyling
verified: 2026-06-01T19:05:00Z
status: passed
score: 22/22 must-haves verified
overrides_applied: 0
gaps_resolved: 2026-06-01
gaps:
  - truth: "Restyling job uses the user-selected style reference instead of silently choosing the first available style asset"
    status: failed
    reason: "Campaign workspace restyling uses POST /restyle with styleAssetIds, but the route never forwards a style asset id to Inngest or persists it on the derivation row; the job falls back to the first role=style_reference asset when contract.styleAssetId is null."
    artifacts:
      - path: "app/src/app/api/campaigns/[id]/restyle/route.ts"
        issue: "Validates styleAssetIds then omits them from createDerivation and inngest.send data"
      - path: "app/src/server/repositories/derivation.ts"
        issue: "CreateDerivationInput has no styleAssetId field; insert never sets style_asset_id"
    missing:
      - "Thread selected styleAssetId(s) from restyle route into derivation row and derivation.generate event data"
      - "Extend createDerivation to accept and persist styleAssetId"
  - truth: "buildRegenerationSuggestion receives contract in its input argument"
    status: failed
    reason: "derivation job passes contract to scoreCompletedDerivation/analyzeDerivationCreative, but analyzeDerivationCreative does not forward contract to buildRegenerationSuggestion."
    artifacts:
      - path: "app/src/server/ai/creative-score.ts"
        issue: "buildRegenerationSuggestion({ ... }) call omits contract: input.contract"
    missing:
      - "Pass contract into buildRegenerationSuggestion from analyzeDerivationCreative"
  - truth: "Regeneration suggestion preserves the same mode, target format, and effective CTA/source contract"
    status: partial
    reason: "Mode and format are preserved via legacy fields, but inherited CTAs still render as Preserve the exact CTA \"none\" when ctaText is null, and restyling base/style asset ids are omitted without contract."
    artifacts:
      - path: "app/src/server/ai/creative-score.ts"
        issue: "buildRegenerationSuggestion uses input.ctaText ?? \"none\" without ctaSemantics branching"
    missing:
      - "Use contract.ctaSemantics for regeneration copy (inherited vs explicit vs absent)"
      - "Include baseAssetId/styleAssetId in regeneration text when contract is passed"
human_verification:
  - test: "Run Estilizar on a campaign with two style_reference assets; pick the second via upload/selection and compare output visual language to the first reference"
    expected: "Output should reflect the user-selected reference, not whichever asset sorts first by role"
    why_human: "Automated verification confirmed the restyle API path does not forward styleAssetIds; visual confirmation needed after fix"
  - test: "Complete a restyling derivation with null ctaText, open regeneration suggestion in workspace UI"
    expected: "Suggestion should describe inherited/base CTA preservation, not literal CTA \"none\", and mention style/base asset ids for restyling"
    why_human: "Copy is user-visible and requires judgment after contract wiring fix"
---

# Phase 45: Creative Contract and Restyling Verification Report

**Phase Goal:** Generation, scoring, QA, regeneration, and UI all agree on the same creative contract.

**Verified:** 2026-06-01T19:05:00Z

**Status:** gaps_found

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | `CreativeContract` + `CtaSemantics` types with required fields | ✓ VERIFIED | `app/src/server/ai/creative-contract.ts` exports interface and union |
| 2 | `resolveCtaSemantics` maps empty/null to inherited | ✓ VERIFIED | Implementation + 6 unit tests in `creative-contract.test.ts` |
| 3 | `styleAssetId` column on derivations + migration | ✓ VERIFIED | `schema.ts` + `app/drizzle/0023_amusing_supreme_intelligence.sql` |
| 4 | Derivations POST forwards `styleAssetId` in Inngest event | ✓ VERIFIED | `derivations/route.ts` lines 51–52, 190 |
| 5 | Job resolves one `CreativeContract` before generation | ✓ VERIFIED | `derivation.ts` lines 312–322 inside job handler |
| 6 | Restyling branch looks up asset by `contract.styleAssetId` | ✓ VERIFIED | `derivation.ts` lines 441–444 with role fallback |
| 7 | `buildDerivationPrompt` uses `ctaSemantics` + restyling factual-source rule | ✓ VERIFIED | `prompt-builder.ts` `buildHardRulesSection` + RESTYLING block |
| 8 | Scoring treats inherited CTA as present, not "none" | ✓ VERIFIED | `creative-score.ts` lines 95–96 inherited instruction |
| 9 | `styleFidelity` QA criterion for restyling only | ✓ VERIFIED | `creative-qa.ts` union, prompt conditional, normalize path |
| 10 | QA API builds and passes contract | ✓ VERIFIED | `derivations/[id]/qa/route.ts` lines 59–90 |
| 11 | CTA semantics + styleFidelity tests pass | ✓ VERIFIED | `npm test` — 36/36 in prompt-builder, creative-qa, creative-contract |
| 12 | Roadmap SC: restyling uses user-selected style reference | ✗ FAILED | `/restyle` omits `styleAssetId` from event/DB; UI sends `styleAssetIds` via `useRestyleCampaign` |
| 13 | Roadmap SC: prompts/QA block style-reference factual copy | ✓ VERIFIED | Prompt RESTYLING rule + `styleFidelity` criterion text |
| 14 | Roadmap SC: CTA contract tests for art/format/restyling | ✓ VERIFIED | `describe("CTA semantics contract")` + restyling cases in `prompt-builder.test.ts` |
| 15 | Roadmap SC: scoring no longer penalizes inherited as absent | ✓ VERIFIED | Inherited branch in `analyzeDerivationCreative` prompt |
| 16 | Roadmap SC: regeneration preserves effective contract | ✗ FAILED | `buildRegenerationSuggestion` not passed `contract`; still uses `ctaText ?? "none"` |
| 17 | `analyzeDerivationCreative` receives contract from job | ✓ VERIFIED | `scoreCompletedDerivation` line 155 |
| 18 | `analyzeCreativeQa` receives contract (QA route) | ✓ VERIFIED | QA route passes `qaContract` |
| 19 | `buildRegenerationSuggestion` supports restyling asset ids when contract provided | ✓ VERIFIED | Function lines 234–237 (capability exists) |
| 20 | `buildRegenerationSuggestion` receives contract from pipeline | ✗ FAILED | Call site at `creative-score.ts` ~199 omits `contract` |
| 21 | `absent` CTA semantics without overloading null | ✓ VERIFIED | Type includes `absent`; `45-CONTEXT.md` documents v11.1 defers surfacing — intentional |
| 22 | `styleAssetId` persisted on derivation create | ✗ FAILED | `createDerivation` input/insert has no `styleAssetId` (event-only for derivations POST) |

**Score:** 18/22 truths verified

### Deferred Items

None — later phases (46–48) cover quality gates and UAT, not restyle asset selection or regeneration contract wiring.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/ai/creative-contract.ts` | Contract types + resolver | ✓ VERIFIED | 32 lines, substantive |
| `app/src/server/db/schema.ts` | `styleAssetId` column | ✓ VERIFIED | gsd-tools artifacts pass |
| `app/src/app/api/campaigns/[id]/derivations/route.ts` | Event payload threading | ✓ VERIFIED | Inngest `styleAssetId` for restyling mode |
| `app/src/server/ai/prompt-builder.ts` | Contract-aware prompts | ✓ VERIFIED | Wired via `contract` on config |
| `app/src/server/ai/creative-score.ts` | Contract-aware scoring | ⚠️ PARTIAL | Scoring prompt wired; regeneration call unwired |
| `app/src/server/ai/creative-qa.ts` | styleFidelity criterion | ✓ VERIFIED | |
| `app/src/server/jobs/derivation.ts` | Single contract + restyling lookup | ✓ VERIFIED | Manual grep confirms wiring (gsd-tools key-links false negative on path) |
| `app/src/server/ai/prompt-builder.test.ts` | CTA + restyling tests | ✓ VERIFIED | |
| `app/src/server/ai/creative-qa.test.ts` | styleFidelity tests | ✓ VERIFIED | |
| `app/src/app/api/campaigns/[id]/restyle/route.ts` | User style selection → job | ✗ STUB (wiring) | Validates IDs but does not pass to job |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| derivations route | Inngest `derivation.generate` | `styleAssetId` in data | ✓ WIRED | gsd-tools verified |
| derivation job | `resolveCtaSemantics` | import + contract build | ✓ WIRED | Lines 14, 315 |
| contract.styleAssetId | restyling asset lookup | `assets.find` by id | ✓ WIRED | Lines 441–444 |
| derivation job | `buildDerivationPrompt` | `contract` config | ✓ WIRED | Line 379 |
| derivation job | `analyzeDerivationCreative` | `contract` arg | ✓ WIRED | Via `scoreCompletedDerivation` |
| `analyzeDerivationCreative` | `buildRegenerationSuggestion` | `contract` | ✗ NOT_WIRED | Missing at call site |
| campaign page → restyle API | job `styleAssetId` | `styleAssetIds` body | ✗ NOT_WIRED | restyle route drops selection |
| prompt-builder tests | `buildDerivationPrompt` | `ctaSemantics` fixtures | ✓ WIRED | Manual read (gsd-tools path issue) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `derivation.ts` restyling branch | `styleAsset` | `contract.styleAssetId` → DB assets | Yes when event/derivation has id | ⚠️ STATIC for `/restyle` UI path (always null → role fallback) |
| `derivation.ts` contract | `ctaSemantics` | `resolveCtaSemantics(effectiveCtaText)` | Yes from request/derivation cta | ✓ FLOWING |
| QA route | `qaContract.styleAssetId` | `derivation.styleAssetId` column | Often null (not set on create) | ⚠️ HOLLOW_PROP unless event populated earlier |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 45 unit tests | `npm test -- --run src/server/ai/prompt-builder.test.ts src/server/ai/creative-qa.test.ts src/server/ai/creative-contract.test.ts` | 3 files, 36 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CNTR-01 | 45-01, 45-04 | Single effective contract before prompt | ✓ SATISFIED | Job builds contract once; passed to prompt/score |
| CNTR-02 | 45-02, 45-04 | Prompt, score, QA, regen use same contract | ⚠️ PARTIAL | Prompt/score/QA wired; regeneration omits contract |
| CNTR-03 | 45-01, 45-05 | Mode-aware CTA semantics | ✓ SATISFIED | Discriminated union + prompt/score branches + tests; `absent` deferred per CONTEXT |
| CNTR-04 | 45-02 | Facts from base/brief, not style ref | ⚠️ PARTIAL | Prompt/QA/score restyling rules present; regeneration suggestion not contract-aware |
| REST-01 | 45-01, 45-04 | User-selected style into job | ✗ BLOCKED | derivations POST event only; `/restyle` + DB persist incomplete |
| REST-02 | 45-02 | Base factual / style visual-only | ✓ SATISFIED | RESTYLING FACTUAL-SOURCE RULE in prompt-builder |
| REST-03 | 45-03 | QA flags style-reference fact copy | ✓ SATISFIED | `styleFidelity` criterion |
| REST-04 | 45-03 | Preserve base factual content | ✓ SATISFIED | Prompt + QA + scoring restyling instructions (visual outcome needs human) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `creative-score.ts` | 228–232 | `ctaText ?? "none"` in regeneration | ⚠️ Warning | Undermines inherited CTA contract in user-facing regen text |
| `restyle/route.ts` | 122–134 | Event payload missing style selection after validation | 🛑 Blocker | Primary UI restyling ignores user choice |

### Human Verification Required

1. **Estilizar style selection (after REST-01 fix)**  
   **Test:** Upload two distinct style references, run restyling using the second.  
   **Expected:** Output visual language matches the selected reference.  
   **Why human:** Requires visual comparison; current code path is broken for `/restyle`.

2. **Regeneration copy for inherited CTA (after CNTR-02 fix)**  
   **Test:** Score a restyling derivation with null `ctaText`, read regeneration suggestion.  
   **Expected:** No literal `"none"` CTA mandate; mentions base/style assets for restyling.  
   **Why human:** UX wording judgment after code fix.

### Gaps Summary

Phase 45 delivered the creative contract types, mode-aware prompt/scoring/QA behavior, derivation-job orchestration for the **derivations POST** path, and solid automated test coverage. Two wiring gaps prevent full goal achievement:

1. **REST-01 / primary UI path:** The campaign workspace calls `POST /api/campaigns/[id]/restyle` with `styleAssetIds`, but that route never sets `styleAssetId` on the derivation or Inngest payload, so the job silently falls back to the first `style_reference` asset.

2. **CNTR-02 / regeneration:** `analyzeDerivationCreative` does not pass `contract` into `buildRegenerationSuggestion`, so regeneration text still treats null CTA as `"none"` and omits restyling asset ids even though the helper supports them.

Additionally, `styleAssetId` is not persisted in `createDerivation`, so post-job QA relies on the column often being null unless populated elsewhere.

Structured gaps are in frontmatter for `/gsd-plan-phase --gaps`.

---

_Verified: 2026-06-01T19:05:00Z_

_Verifier: Claude (gsd-verifier)_
