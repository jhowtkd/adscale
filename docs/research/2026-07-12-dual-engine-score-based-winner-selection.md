# Research: Dual-Engine Score-Based Winner Selection

**Date:** 2026-07-12  
**Status:** proposal  
**Scope:** ONE wiring improvement — close G1 of dual-engine image generation by selecting the highest-scoring candidate instead of always picking OpenAI-first  
**Related:** dual-engine spec (2026-07-08), milestone audit `.planning/dual-engine-image-generation-MILESTONE-AUDIT.md`, `app/AGENTS.md` (MVP limitation), migration `0073_derivations_candidates`

---

## 1. Executive summary

Dual-engine image generation is **shipped on `main`**: OpenAI gpt-image-2 and BytePlus Seedream 5 Pro run in parallel, both candidates upload to R2, and metadata persists on `derivations.candidates`. However, the orchestrator **always selects index 0 (OpenAI-first)** as the winner regardless of quality. The approved design explicitly requires the existing `creative-score.ts` rubric to pick the best candidate.

With default `SEEDREAM_SAMPLE_RATE=1.0`, the platform pays for two image providers on every derivation but **cannot realize Seedream’s reproduction advantages** (branded product fidelity, format-adaptation composition). Downstream scoring, quality gates, corpus learning, and Cenbrap calibration all evaluate whichever image was arbitrarily chosen — biasing learning signal toward OpenAI outputs.

**Recommendation:** Wire per-candidate `analyzeDerivationCreative` scoring into winner selection inside the derivation path. When two candidates succeed, score both in parallel, pick `argmax(qualityScore)` with OpenAI as tie-breaker, persist per-candidate scores on `candidates` jsonb, and emit `score`/`quality` in the dual-engine telemetry event. Reuse the existing rubric — no new dependencies, schema migrations, or compare-two-images judge. Phase 1 targets derivation jobs only; creative-work and brand-training remain OpenAI-first until context threading is validated.

---

## 2. Problem

### 2.1 Problem statement

ADScale invested in a dual-provider image pipeline to improve reproduction quality and reduce single-vendor risk, but the MVP winner selection **ignores the scoring infrastructure the design depends on**. Paying 2× image COGS without score-based selection yields uncertain quality ROI and undermines the business case for Seedream participation.

### 2.2 Evidence

| Layer | What exists | Gap |
|-------|-------------|-----|
| **Design spec** | Architecture diagram shows “score each candidate in parallel” → return winner | Not implemented |
| **Milestone audit G1** | Parallel engines verified | `winnerIndex = 0` — status `partial` |
| **Code** | `GenerationCandidateMeta` already has optional `score` and `quality` fields | Never populated at generation time |
| **Telemetry** | `recordDualEngineCandidates` accepts per-candidate `score`/`quality` | Emitted without scores; win-rate reads “OpenAI always wins” |
| **Downstream** | `score-derivation` Inngest step scores the pre-selected winner only | Loser candidate never scored in production |
| **Ops docs** | `app/AGENTS.md` documents MVP limitation as accepted follow-up | Explicit tech debt, Task 13 in audit |
| **Env default** | `SEEDREAM_SAMPLE_RATE` defaults to `1.0` in `env.ts` | Full dual-engine cost active without quality upside |

### 2.3 Key code references

**Winner hard-coded to first candidate** (`app/src/server/ai/image-generation.ts`):

```219:225:app/src/server/ai/image-generation.ts
  // Pick the winner. Today this is the first candidate (provider order).
  // A future task wires in creative-score per candidate and picks the
  // highest-scoring one. For the rollout, the order is: openai first,
  // seedream second; OpenAI wins on tie so behavior is identical to
  // pre-change when only OpenAI is enabled.
  const winnerIndex = 0;
  const winner = candidates[winnerIndex];
```

**Design requires score-based selection** (`docs/superpowers/specs/2026-07-08-dual-engine-image-generation-design.md`):

> Run two image generation providers … in parallel for every derivation, then let the existing quality gate / scoring choose the best candidate.

**Milestone audit verdict** (`.planning/dual-engine-image-generation-MILESTONE-AUDIT.md`):

> G1 is not met as specified. Scoring does not choose the winner; OpenAI always wins when both succeed.

**Downstream scores only the winner** (`app/src/server/jobs/derivation.ts`):

```1032:1052:app/src/server/jobs/derivation.ts
    await step.run("score-derivation", async () => {
      const scoreBuffer = await objectStorage.get(generated.outputKey);
      await scoreCompletedDerivation(derivationId, workspaceId, scoreBuffer, campaign, { ... });
    });
```

### 2.4 Business impact

1. **Quality:** Restyling and format-adaptation modes — Seedream’s stated strengths — never win even when they produce better reproduction.
2. **Cost ROI:** At `SEEDREAM_SAMPLE_RATE=1.0`, every derivation incurs ~2× image provider cost without guaranteed quality improvement.
3. **Learning integrity:** Corpus calibration, Cenbrap evidence, and quality-gate pass rates reflect OpenAI-biased outputs, skewing rule extraction and taste profiles.
4. **Operator trust:** Dual-engine is documented as shipped, but the primary quality benefit is deferred indefinitely without an explicit delivery plan.

### 2.5 Why now (and not other gaps)

Prior automation runs already proposed:

| Topic | Status |
|-------|--------|
| Olhar narrative bridge (2026-07-05) | Open — separate concern (post-gate narrative source) |
| Dual verdict persistence (2026-06-30) | Wired |
| Auto-retry observability (2026-06-29) | Largely shipped |

Other candidate gaps evaluated and deprioritized for this run:

| Alternative | Why deprioritized |
|-------------|-------------------|
| Credit refund on failed derivations | Explicit v1 product policy; needs stakeholder decision |
| Calibration rules in quality gate | Preventive (prompt) vs evaluative; larger design surface |
| `improvementTargets` consumer for auto-retry | Partially superseded by corpus → rules → prompt path |
| Creative-work candidates persistence | Lower volume; derivation path is primary COGS driver |

Dual-engine winner selection is **approved design debt with infrastructure in place** — the highest-impact single wiring change for image quality per dollar spent.

---

## 3. Solution

### 3.1 Overview

When `generateAndStoreImage` receives **two successful candidates**, score each with the existing `analyzeDerivationCreative` function, select the highest `qualityScore`, and upload the winner to the final `outputKey`. Persist scores on the `candidates` jsonb array and emit them in telemetry.

Single-candidate paths (Seedream disabled, one provider failed, or `SEEDREAM_SAMPLE_RATE=0`) remain unchanged — behavior identical to today.

### 3.2 Context threading (critical design detail)

`generateAndStoreImage` today accepts only prompt, dimensions, references, and output prefix — **no campaign or derivation context**. `analyzeDerivationCreative` requires campaign brief fields, derivation metadata (format, CTA, generation mode), locale, and optional `CreativeContract`.

**Recommended approach:** Add an optional `winnerSelection?: WinnerSelectionContext` block to `GenerateAndStoreImageInput`. When absent or when only one candidate exists, keep OpenAI-first behavior. When present with 2 candidates, score and pick.

```typescript
type WinnerSelectionContext = {
  campaign: { name; client; product; offer; objective; audience; creativeLevel?; creativeDiagnosis? };
  derivation: { ctaText; format; generationMode; feedback; parentId? };
  locale: string;
  contract: CreativeContract | null;
};
```

Thread this from `executeGenerationStep` in `derivation-pipeline.ts`, which already has full prompt context via `ExecuteGenerationStepContext`.

### 3.3 Selection algorithm

```
if candidates.length <= 1:
  winnerIndex = 0
else if winnerSelection provided:
  scores = await Promise.all(candidates.map(c => analyzeDerivationCreative({ imageBuffer: c.normalized, ...winnerSelection })))
  winnerIndex = argmax(scores, key=qualityScore, tieBreak=providerOrder["openai","seedream"])
  attach score + mapScoreToQuality(qualityScore) to each candidate meta
else:
  winnerIndex = 0  // backward compatible for creative-work / brand-training callers
```

Tie-breaker: OpenAI wins on equal score — preserves pre-change behavior when scores are indistinguishable and avoids flip-flopping.

On scorer failure for one candidate: treat failed candidate as `qualityScore = 0`, `scoreStatus = "failed"`; if both fail scoring, fall back to OpenAI-first (index 0) with a warning log.

### 3.4 Duplicate scoring optimization (Phase 2)

The derivation job’s `score-derivation` step currently re-scores the winner after selection. Once winner selection embeds full `analyzeDerivationCreative` output:

- **Phase 1 (safe):** Accept duplicate score call on winner — simpler, idempotent via `updateDerivationScore`.
- **Phase 2 (optional):** Pass winner’s pre-computed `ScoreResult` through the generation result; skip re-analysis in `score-derivation` when `candidates[].score` is present on the winner. Saves one vision call per dual-engine derivation (~50% scoring cost reduction on 2-candidate runs).

### 3.5 Telemetry enrichment

Populate existing optional fields on `DualEngineCandidateEvent.candidates[]`:

- `score`: `qualityScore` from scorer
- `quality`: map from score thresholds aligned with quality gate bands (or defer to post-gate in Phase 1)

Also thread `campaignId`, `workspaceId`, and correct `jobType` (audit Task 14) when extending the helper signature — can ship alongside or immediately after winner selection.

### 3.6 Files to touch (implementation guide)

| File | Change |
|------|--------|
| `app/src/server/ai/image-generation.ts` | Winner selection logic; optional scoring context |
| `app/src/server/ai/derivation-pipeline.ts` | Pass `winnerSelection` from `ExecuteGenerationStepContext` |
| `app/src/server/jobs/derivation.ts` | Optionally skip duplicate winner re-score (Phase 2) |
| `app/src/server/ai/image-generation.test.ts` | Unit tests: Seedream wins on higher score; tie → OpenAI; single candidate unchanged |
| `app/src/server/ai/generation-log.test.ts` | Verify score fields emitted |
| `app/AGENTS.md` | Remove MVP limitation note once shipped |

**Out of scope for Phase 1:** creative-work (`app/src/server/jobs/creative-work.ts`), brand-training image paths, schema changes, new rubric dimensions.

---

## 4. Alternatives

### 4.1 Keep OpenAI-first; lower `SEEDREAM_SAMPLE_RATE`

Dial sample rate to 0.1–0.3 for A/B measurement without score selection.

| Pros | Cons |
|------|------|
| Zero code change | Does not close G1; still wastes spend on sampled runs |
| Immediate cost control | Cannot prove Seedream quality advantage systematically |

### 4.2 Human/blind comparison judge (new “compare two images” prompt)

Add a dedicated pairwise vision call that picks the better image holistically.

| Pros | Cons |
|------|------|
| Could capture nuances score rubric misses | Violates spec non-goal (“no new compare-two-images judge”) |
| | New prompt to calibrate and maintain |
| | Extra vision call beyond per-candidate scoring |

### 4.3 Score in Inngest job after generation (re-select winner post-hoc)

Return both candidates without picking winner; re-upload final key in `derivationJob` after scoring.

| Pros | Cons |
|------|------|
| Keeps `generateAndStoreImage` context-free | Requires re-upload or key swap; more Inngest step complexity |
| | `outputKey` contract assumes winner already at final path |

### 4.4 Heuristic winner (e.g., information preservation dimension only)

Score only the `informationPreservation` breakdown dimension for restyling/format modes.

| Pros | Cons |
|------|------|
| Cheaper / faster | Mode-specific logic; diverges from approved “existing rubric” approach |
| | Still requires vision calls per candidate |

### 4.5 Recommended: full rubric per candidate (Section 3)

Matches approved design, reuses calibrated `creative-score.ts`, populates existing metadata slots, and enables honest provider win-rate telemetry.

---

## 5. Pros and cons

### Pros

- Closes the largest remaining dual-engine tech-debt item (audit G1).
- Realizes quality ROI on 2× image spend when Seedream produces better reproduction.
- No schema migration — `candidates` jsonb and telemetry types already anticipate scores.
- Reuses existing, calibrated scoring rubric (Phases 119–140).
- Low blast radius when gated: single-candidate paths unchanged; tie-break preserves OpenAI default.
- Enables honest provider win-rate metrics for ops tuning of `SEEDREAM_SAMPLE_RATE`.
- Rollback remains env-only: `SEEDREAM_SAMPLE_RATE=0` + worker restart.

### Cons

- Adds 1–2 vision scoring calls per dual-engine derivation at generation time (before existing `score-derivation` step).
- Increases Inngest step latency on the generation path (~3–8s per scorer call, parallelizable).
- Scorer was calibrated on final outputs, not mid-pipeline selection — may need monitoring for selection bias.
- Creative-work and brand-training remain OpenAI-first until follow-up context threading.
- Duplicate scoring on winner until Phase 2 optimization ships.

---

## 6. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scoring latency blocks generation step | Medium | Run per-candidate scores in `Promise.all`; set step timeout budget; feature-flag via env `DUAL_ENGINE_SCORE_WINNER=1` if needed |
| Scorer failure leaves no winner | Low | Fall back to OpenAI-first; log warning; existing behavior |
| Seedream wins on score but fails quality gate | Medium | Expected — gate remains authoritative for approval; selection optimizes pre-gate quality |
| COGS increase from extra vision calls | Medium | Phase 2 dedup; monitor cost per derivation in owner analytics |
| Selection bias vs human preference | Medium | Track win-rate + Cenbrap mismatch rate per provider for 30 days before tuning sample rate |
| Context threading breaks creative-work callers | Low | Optional context — absent means OpenAI-first (current behavior) |
| Flapping winners on near-tie scores | Low | OpenAI tie-breaker; consider minimum score delta threshold in Phase 3 if observed |

---

## 7. Effort

| Component | Estimate |
|-----------|----------|
| `WinnerSelectionContext` type + image-generation winner logic | Small — ~80–120 LOC |
| Thread context through derivation-pipeline | Small — ~20 LOC |
| Unit tests (winner matrix, failure fallbacks) | Small — ~100 LOC |
| Telemetry score population | Trivial — ~15 LOC |
| Phase 2 dedup in score-derivation | Small — ~40 LOC |
| Staging validation (dual-engine derivations, restyling + format modes) | Manual — owner runbook |

**Overall:** Small-to-medium engineering effort. No migration, no new dependencies, no UI changes. Primary complexity is context threading and latency budgeting within Inngest steps.

---

## 8. Phases

### Phase 1 — Derivation-path score winner (MVP)

1. Add optional `winnerSelection` to `GenerateAndStoreImageInput`.
2. When 2 candidates + context present: parallel `analyzeDerivationCreative`, pick highest score, OpenAI tie-break.
3. Populate `candidates[].score` on persisted jsonb; emit in telemetry.
4. Unit tests covering win/lose/tie/failure matrix.
5. Update `app/AGENTS.md` to reflect shipped behavior.

**Exit criteria:** Vitest green for touched files; manual staging derivation with both providers shows non-OpenAI winner when Seedream scores higher; telemetry JSON includes per-candidate scores.

### Phase 2 — Dedup downstream scoring

1. Return winner’s full `ScoreResult` from generation step.
2. In `score-derivation`, skip `analyzeDerivationCreative` when winner score already present; still run heuristic fallback if scorer failed.
3. Measure vision call reduction in staging.

**Exit criteria:** Dual-engine derivations make exactly N scorer calls (N = candidate count), not N+1.

### Phase 3 — Ops tuning and evidence

1. Thread `campaignId`/`workspaceId` into telemetry (audit Task 14).
2. Add owner analytics slice: provider win rate, avg score delta, cost per win.
3. Run 30-day observation; tune `SEEDREAM_SAMPLE_RATE` based on measured quality lift vs COGS.
4. Document rollback/runbook alignment (env boot-parse vs hot reload — audit G4 note).

**Exit criteria:** Owner dashboard or log query shows Seedream win rate > 0 when sample rate > 0; COGS/quality trade-off documented.

### Phase 4 — Extend to creative-work (optional)

1. Thread winner selection context through `creative-work.ts` generate path.
2. Persist candidates on creative-work outputs (audit persistence-scope debt).

**Exit criteria:** Triplet generation benefits from dual-engine selection where applicable.

---

## 9. Open questions

1. **Minimum score delta:** Should a candidate win only if it beats the incumbent by ≥ N points (e.g., 5), to avoid noise-driven flips? Default: no delta in Phase 1; revisit after telemetry.
2. **Phase 1 env gate:** Ship score-winner unconditionally when context is present, or behind `DUAL_ENGINE_SCORE_WINNER` env for staged rollout?
3. **Quality band on telemetry:** Map `qualityScore` to `invalid/improvable/acceptable` at selection time, or leave `quality` unset until post-gate?
4. **Scorer locale:** Derivation job uses user locale; confirm same locale for mid-pipeline selection scoring.
5. **Auto-retry interaction:** If winner fails quality gate and auto-retry fires, should retry re-run dual-engine with score selection? (Likely yes — same path — but verify COGS budget.)
6. **Acceptance threshold for sample rate increase:** What Seedream win rate or Cenbrap mismatch reduction justifies raising `SEEDREAM_SAMPLE_RATE` above current default?
7. **Stakeholder sign-off on extra vision COGS:** Phase 1 adds 1–2 scorer calls per dual-engine run until Phase 2 dedup — confirm acceptable against current unit economics.

---

## Verification performed

| Check | Result |
|-------|--------|
| `winnerIndex = 0` in `image-generation.ts` | Confirmed (lines 219–225) |
| Design spec requires score-based winner | Confirmed (`docs/superpowers/specs/2026-07-08-dual-engine-image-generation-design.md`) |
| Milestone audit G1 status `partial` | Confirmed (`.planning/dual-engine-image-generation-MILESTONE-AUDIT.md`) |
| `GenerationCandidateMeta.score` field exists | Confirmed (`image-generation.ts` L26–27) |
| Telemetry accepts per-candidate score | Confirmed (`generation-log.ts` L99–100) |
| `analyzeDerivationCreative` reusable per buffer | Confirmed (`creative-score.ts` L407+) |
| Default `SEEDREAM_SAMPLE_RATE=1.0` | Confirmed (`env.ts`, `.env.example`) |
| No duplicate of prior research topics | Confirmed against `docs/research/2026-07-05-*`, `2026-06-30-*`, `2026-06-29-*` |
| Test suite | Not run — research-only doc, no production code changed |

---

## References

- `app/src/server/ai/image-generation.ts` — orchestrator, winner selection
- `app/src/server/ai/creative-score.ts` — existing rubric
- `app/src/server/ai/generation-log.ts` — dual-engine telemetry
- `app/src/server/ai/derivation-pipeline.ts` — generation wrapper
- `app/src/server/jobs/derivation.ts` — post-generation scoring step
- `docs/superpowers/specs/2026-07-08-dual-engine-image-generation-design.md`
- `.planning/dual-engine-image-generation-MILESTONE-AUDIT.md`
- `app/AGENTS.md` — MVP limitation documentation
