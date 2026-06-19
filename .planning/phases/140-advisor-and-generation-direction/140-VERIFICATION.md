---
phase: 140-advisor-and-generation-direction
verified: 2026-06-19T12:25:00Z
status: passed
score: 4/4
overrides_applied: 0
deferred:
  - truth: "Numeric score is no longer the primary user-facing signal in workspace UI"
    addressed_in: "Phase 141"
    evidence: "Phase 141 goal: workspace shows Olhar first, export second; REVIEW-01 pending. Phase 140 plan explicitly scoped UI demotion out (server contracts/types only)."
  - truth: "Cenbrap client voice injected into generation prompts"
    addressed_in: "Phase 138 voice review gate"
    evidence: "CENBRAP_VOICE_REVIEW_STATUS remains pending_review; voice-review-gate.ts blocks injection until approved — intentional per 140-02 decision."
---

# Phase 140: Advisor and Generation Direction Verification Report

**Phase Goal:** Preflight, QA, score and generation prompts passam a falar como diretor de arte senior: figura, gestalt, ritmo, convite e voz, mantendo compliance como segunda passagem.

**Verified:** 2026-06-19T12:25:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Preflight becomes `Leitura do base` with dominant idea, gestalt, invite weight, thumbnail read, brand presence and at most two real risks | ✓ VERIFIED | `preflight-analysis.ts` system prompt requests `baseReading` with all fields; `normalizeBaseCreativeReading` caps risks at 2; schema enforces `risks.max(2)`; `buildPreflightPromptSection` renders Leitura do base before compatibility scores |
| 2 | Post-generation QA/score returns art-direction verdicts and short notes instead of generic compliance/checklist language | ✓ VERIFIED | `creative-qa.ts` splits `Passagem Olhar` vs `Exportacao`; `olhar-qa.ts` builds `OlharVerdictPayload` with `whatWorks`/`whatBlocks`/`directionNote`; `creative-score.ts` prompt is direction-first with `olharVerdict`/`directionNote` primary; QA route persists verdict via `updateDerivationDualVerdict` |
| 3 | Prompt builder injects a concise direction paragraph with sacred facts, allowed variation and anti-patterns | ✓ VERIFIED | `generation-direction.ts` exports `buildGenerationDirectionSection` with gestalt, sacred facts, variation range, Olhar anti-patterns; `prompt-builder.ts` injects after hard rules before MODE; test asserts ordering |
| 4 | Numeric score is no longer the primary server signal | ✓ VERIFIED | `buildCreativeScorePrompt` labels `qualityScore` as secondary/internal analytics; `ScoreResult` exposes optional `olharVerdict`/`directionNote`/`whatWorks`/`whatBlocks`; `use-derivations.ts` and `mock-data.ts` carry dual-verdict types; workspace UI demotion deferred to Phase 141 (see deferred) |

**Score:** 4/4 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | User-facing score demotion in workspace UI | Phase 141 | `DerivationReviewSheet.tsx` still displays `qualityScore`; Phase 141 goal is Olhar-first review surface (REVIEW-01) |
| 2 | Live Cenbrap voice in generation prompts | 138 voice review | `voice-review-gate.ts` keeps `CENBRAP_VOICE_REVIEW_STATUS = pending_review`; tests prove no unapproved injection |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/ai/olhar/base-reading.ts` | BaseCreativeReading contract + normalizer | ✓ VERIFIED | 110 lines; exports normalize, prompt section, MAX_RISKS=2 |
| `app/src/server/ai/olhar/olhar-qa.ts` | Passagem Olhar verdict builder | ✓ VERIFIED | 164 lines; wired from QA route |
| `app/src/server/ai/olhar/generation-direction.ts` | Generation direction paragraph | ✓ VERIFIED | 226 lines; wired from prompt-builder |
| `app/src/server/ai/voices/voice-review-gate.ts` | Cenbrap review gate | ✓ VERIFIED | Created in 140-02; blocks pending voice |
| `app/src/server/ai/preflight-analysis.ts` | Leitura do base prompt + normalization | ✓ VERIFIED | Prompt + optional `baseReading` on result |
| `app/src/server/ai/creative-qa.ts` | Passagem Olhar / Exportacao split | ✓ VERIFIED | Two-pass prompt language |
| `app/src/server/ai/prompt-builder.ts` | Direction injection after hard rules | ✓ VERIFIED | Uses `config.preflightResult?.baseReading` |
| `app/src/server/ai/creative-score.ts` | Direction-first score contract | ✓ VERIFIED | Secondary qualityScore in prompt |
| `app/src/app/api/derivations/[id]/qa/route.ts` | Persist olharVerdict | ✓ VERIFIED | `buildPassagemOlharVerdict` → `updateDerivationDualVerdict` |
| `app/src/lib/hooks/use-derivations.ts` | Dual-verdict types | ✓ VERIFIED | `olharVerdict` + `exportStatus` optional fields |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `preflight-analysis.ts` | `base-reading.ts` | `normalizeBaseCreativeReading` in normalizer | ✓ WIRED | Lines 326–331 |
| `preflight-analysis.ts` | generation prompts | `buildBaseReadingPromptSection` in `buildPreflightPromptSection` | ✓ WIRED | Lines 382–383 |
| `prompt-builder.ts` | `generation-direction.ts` | `buildGenerationDirectionSection` with `baseReading` | ✓ WIRED | Lines 453–462 |
| `creative-qa.ts` | `olhar-qa.ts` | QA route calls `buildPassagemOlharVerdict` after gate | ✓ WIRED | `qa/route.ts` lines 157–172 |
| `derivation.ts` job | preflight → direction | `preflightResult` from asset metadata | ✓ WIRED | `derivation.ts` passes metadata to prompt builder |
| `creative-score.ts` | `ScoreResult` | `normalizeCreativeScoreResult` parses direction fields | ✓ WIRED | Optional olharVerdict/directionNote preserved |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `preflight-analysis.ts` | `baseReading` | Vision model JSON → `normalizeBaseCreativeReading` | Yes (when model returns valid fields) | ✓ FLOWING |
| `olhar-qa.ts` | `OlharVerdictPayload` | QA checklist + hard failures (art-direction only) | Yes; null for export-only | ✓ FLOWING |
| `generation-direction.ts` | gestalt/sacred facts | `baseReading` or canonical creative fallback | Yes | ✓ FLOWING |
| `qa/route.ts` | `olharVerdict` response | `buildPassagemOlharVerdict` → DB persist | Yes when art-direction signal exists | ✓ FLOWING |
| `derivation.ts` score job | score direction fields | `analyzeDerivationCreative` | Computed but not persisted to DB (only numeric score fields via `updateDerivationScore`); full payload comes from QA path | ℹ️ PARTIAL — acceptable per plan scope |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 140 focused test suite | `npm test -- olhar/* prompt-builder creative-qa creative-score use-derivations` | 111 tests passed (6 files) | ✓ PASS |
| Generation direction ordering | `prompt-builder.test.ts` — injects after hard rules before MODE | 5 targeted filter tests passed | ✓ PASS |
| Score prompt demotion | `creative-score.test.ts` — secondary qualityScore | Matched in test suite | ✓ PASS |
| Risk cap at 2 | `base-reading.test.ts` | Passed | ✓ PASS |
| Export-only → null Olhar verdict | `olhar-qa.test.ts` | Passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| ADVISOR-01 | 140-01 | Preflight `Leitura do base` with creative reading fields | ✓ SATISFIED | `preflight-analysis.ts` prompt + `base-reading.ts` normalizer |
| ADVISOR-02 | 140-01 | QA/score as `Passagem Olhar` art-direction language | ✓ SATISFIED | `creative-qa.ts` two-pass prompt; `olhar-qa.ts`; direction-first `creative-score.ts` |
| ADVISOR-03 | 140-02 | Generation prompts inject direction paragraph | ✓ SATISFIED | `generation-direction.ts` + `prompt-builder.ts` injection |
| ADVISOR-04 | 140-02 | Numeric score demoted; dual verdict primary | ✓ SATISFIED | Score prompt + `ScoreResult`/hook types; UI demotion deferred to 141 |

No orphaned requirements — all four ADVISOR IDs declared in plans are implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/placeholder stubs in phase artifacts | — | None |

### Human Verification Required

None required for phase closure. Server contracts and automated tests cover deliverables. Workspace UI prioritization and Cenbrap voice approval are explicitly deferred (see deferred section).

### Gaps Summary

No gaps blocking phase goal achievement. All four roadmap success criteria are met at the server/prompt layer. Workspace UI still surfaces numeric score first — intentional deferral to Phase 141 per plan scope.

---

_Verified: 2026-06-19T12:25:00Z_  
_Verifier: Claude (gsd-verifier)_
