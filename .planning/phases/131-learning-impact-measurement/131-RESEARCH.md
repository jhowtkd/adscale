# Phase 131: Learning Impact Measurement - Research

**Researched:** 2026-06-17
**Domain:** v12.4 output-learning application attribution, human corpus comparative impact reporting, honest insufficient-sample gates
**Confidence:** HIGH

## Summary

Phase 131 closes the **measurement gap** between v12.4's fixture-based output-learning release evidence (`qualityImprovementPathRate=1.0` in Phase 128) and v12.5's goal of proving whether recommendation/prefill improves real human-judged outputs [VERIFIED: `REQUIREMENTS.md:IMPACT-*`, `STATE.md` v12.5 direction]. Phases 129–130 built the corpus and calibration layers; Phase 131 must answer: *for comparable real samples, did outputs generated with output-learning prefill fare better on human visual score, rejection/regeneration intent, and factual pass rate — and can we say so honestly when sample size is too small?*

**Critical brownfield gap (IMPACT-01):** v12.4 recommendation/prefill is **client-orchestrated** today. `OutputLearningRecommendationCard` fetches `/api/campaigns/[id]/output-recommendation`, records beta analytics events on accept/dismiss, and passes prefill into `StrategyRecipePanel` via `useDerivationFlow` — but **derivations have no persisted field** indicating output-learning application [VERIFIED: `OutputLearningRecommendationCard.tsx:96-111`, `schema.ts:596-650` derivations table, `generation-log.ts:10-23` no learning fields]. `AppliedLearningTrace` exists only in the recommendation API response and logs (`logAppliedLearningTrace`) — not on the derivation row or corpus `qualitySnapshot` [VERIFIED: `guards.ts:151-211`, `human-quality/corpus.ts:45-57`]. Phase 131 must add bounded, Postgres-auditable application metadata before impact reports can satisfy IMPACT-01/02.

**Primary recommendation:** Add a pure TypeScript `human-quality/impact/` module that joins evaluated corpus rows (reusing `listEvaluatedCorpusWithEvaluations`), enriches each row with a frozen `outputLearningApplication` snapshot (IMPACT-01), compares **learned vs non-learned** arms within `clientProfileId × generationMode × format` slices (IMPACT-02), emits a versioned `LearningImpactReport` with separate `learningImpactMetrics`, `intentMetrics`, `visualMovementMetrics`, and `factualMetrics` buckets (IMPACT-03), and returns `status: "insufficient_sample"` when comparability or global minimums fail (IMPACT-04). Mirror Phase 130's CLI + `check-*-evidence.mjs` + optional owner API/UI tab on `HumanQualityCorpusPanel`. **Do not** claim improvement from fixture eval matrix or beta analytics alone — Postgres corpus + explicit application attribution is the audit contract.

<user_constraints>
## User Constraints (from STATE.md + Phase 129/130 boundaries — no Phase 131 CONTEXT.md)

### Locked Decisions
- [v12.5]: Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- [v12.5]: Measure whether v12.4 output-learning recommendation/prefill improves comparable real samples.
- [v12.5]: Keep factual metrics separate from visual quality and learning-impact metrics.
- [Phase 129]: Corpus inclusion is explicit/manual; cohort labels `baseline | pre_learning | post_learning`; Postgres canonical; no prompts/signed URLs in corpus payloads.
- [Phase 129]: Human visual score 0–100; factual pass/fail and intent (`approve | reject | regenerate`) stored separately.
- [Phase 129]: Future Phase 131 will use cohort metadata **and** whether output-learning recommendation/prefill was applied [VERIFIED: `129-CONTEXT.md:90`].
- [Phase 130]: Calibration uses frozen `qualitySnapshot` at selection time; `insufficient_corpus` when global evaluated count < 5; slice proposals need ≥3 items; `visualMetrics` / `factualMetrics` never blended [VERIFIED: `calibration/report.ts:10-11,98`, `130-CONTEXT.md`].
- [Phase 130]: Phase 130 does **not** measure learning impact — that is Phase 131 [VERIFIED: `130-CONTEXT.md:11,90`].
- [v12.4]: `output_decision_events`, `client_output_learnings`, `/api/campaigns/[id]/output-recommendation`, `guardOutputLearningPrefill`, `filterApprovedPostgresLearnings` — factual/authorization boundaries preserved [VERIFIED: `STATE.md`].
- [v12.3]: Factual fidelity baseline must remain 1.0 in any new release gate; accepted visual gap `meanQualityScore 70.17 < 75`.

### Claude's Discretion
- Exact module paths (`impact/` vs `learning-impact/`), API route paths, evidence JSON location under `.planning/phases/131-*`.
- Minimum sample thresholds for `ok` vs `insufficient_sample` (recommend mirror Phase 130: ≥5 global evaluated items; ≥3 per comparability arm per slice; require both `learned` and `non_learned` arms in slice for cross-arm deltas).
- Whether application snapshot is persisted on `derivations` jsonb, `generation_log`, or corpus-only at selection (recommend derivation jsonb + corpus snapshot copy for audit freeze).
- Plan wave count (2–3 plans): attribution instrumentation + impact core vs evidence/API/UI.
- UI: new tab on `HumanQualityCorpusPanel` vs extend Calibration tab (recommend dedicated **Impact** read-only tab).
- Cohort-based movement (`pre_learning` → `post_learning`) as supplementary section vs primary learned/non-learned comparison.

### Deferred Ideas (OUT OF SCOPE)
- Applying prompt/gate/rubric changes (Phase 132 — QUALITY-*).
- Milestone release gate orchestration (Phase 133 — QA-22–24).
- Owner dashboard trend lines (LIVEQUAL-02).
- Media performance blending (PERFOUT-*).
- ML causal inference / A/B significance testing — corpus N is too small; descriptive comparison + honesty gates only.
- Re-scoring derivations or re-running recommendation at report time.
- Mem0 or beta analytics as impact source of truth.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMPACT-01 | System can measure whether v12.4 output-learning recommendation/prefill was applied for a generated sample | Bounded `OutputLearningApplicationSnapshot` on derivation + frozen copy in corpus `qualitySnapshot`; resolve `learningApplied: boolean` per evaluated row |
| IMPACT-02 | Evaluation separates learned vs non-learned comparable outputs by client, mode and format | Slice key `clientProfileId\|generationMode\|format`; partition rows by `learningApplied`; per-slice arm counts and metrics |
| IMPACT-03 | Impact report measures rejection/regeneration intent, human visual score movement and factual pass rate | `intentMetrics` (reject+regenerate rates per arm), `visualMovementMetrics` (mean delta learned−non_learned, optional cohort movement), `factualMetrics` (pass rate per arm, separate bucket) |
| IMPACT-04 | If evidence is insufficient, report returns honest insufficient-sample state instead of claiming improvement | `status: "ok" \| "insufficient_sample"`; null movement deltas; checker rejects improvement claims when status ≠ ok |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Application attribution capture (IMPACT-01) | API / Backend (derivation create + validation) | Browser (pass bounded trace on accept→generate) | Server must persist canonical bounded snapshot; client only forwards accept trace |
| Corpus snapshot freeze | API / Backend (`human-quality/service`) | — | Selection-time freeze matches Phase 129/130 audit pattern |
| Learned vs non-learned comparison (IMPACT-02) | API / Backend (`human-quality/impact`) | Repository join | Pure aggregation over Postgres evaluated corpus |
| Intent / visual / factual impact metrics (IMPACT-03) | API / Backend (report schema) | — | Same separation pattern as Phase 128/130 metric buckets |
| Insufficient-sample honesty (IMPACT-04) | API / Backend (report `status`) | CLI evidence checker | Blocks false improvement claims at CI and UI |
| Impact report UI | Browser / Client (read-only tab) | API route | Mirror Phase 130 Calibration tab; platform-owner + workspace admin |
| Fixture eval matrix re-run | — (out of scope) | — | v12.4 fixtures prove pipeline safety, not live impact |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project pin | Impact math, types, report builders | Brownfield; Phases 129–130 pattern |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Unit tests for pure impact functions | `app/config/vitest.config.ts` |
| Drizzle ORM | project pin | Join evaluated corpus + evaluations; optional derivation application column | Phase 129/130 repos |
| Zod | project pin | API query/body validation for bounded application snapshot | Phase 129 routes |
| `human-quality/corpus.ts` | — | Cohort enums, snapshot sanitization | Extend with application snapshot helpers |
| `human-quality/calibration/types.ts` | — | `EvaluatedCorpusRow` | Re-export/join consumer |
| `output-learning/safety/types.ts` | — | `AppliedLearningTrace` shape reference | Bounded fields for application snapshot (no prompts) |
| `output-learning/recommendation/types.ts` | — | `OUTPUT_LEARNING_ALGORITHM_VERSION` | Version stamping on snapshots |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | project pin | `run-learning-impact.ts` CLI | Mirror `run-score-calibration.ts` |
| Node `fs` + JSON evidence | — | `.planning/phases/131-*` CI artifacts | Phase 133 gate precursor |
| `requireCalibrationAccess` pattern | — | Dual auth for impact API | Reuse or extend `calibration-access.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Derivation-persisted application snapshot | Beta analytics `output_learning_recommendation_accepted` join | Not canonical; no derivation linkage; violates Postgres truth pattern |
| Operator-only manual `learningApplied` flag | Auto snapshot from derivation | Manual error-prone; acceptable only as override, not sole source |
| Cohort-only comparison (`post_learning` vs `baseline`) | Learned vs non-learned within slice | Cohort is temporal label; IMPACT-02 requires explicit learned/non-learned separation — use both |
| `simple-statistics` / scipy for p-values | Descriptive means + honesty gates | Corpus N too small; p-values invite false confidence |
| Separate top-level dashboard | Tab on `HumanQualityCorpusPanel` | Phase 130 precedent; internal operator surface |

**Installation:** None — no new npm dependencies.

**Version verification:** `npm view vitest version` → 4.1.9 (2026-06-17); `app/package.json` pins `^4.1.5`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ v12.4 recommendation (existing)                                              │
│  GET /api/campaigns/[id]/output-recommendation → AppliedLearningTrace       │
│  User accept → StrategyRecipePanel prefill → campaign patch → derivations POST│
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ NEW: bounded outputLearningApplication on create
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ derivations.output_learning_application (jsonb, bounded)                       │
│  { applied, traceId?, recommendationId?, primaryVariableKey?, algorithmVer } │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 129 corpus selection (existing + extend)                               │
│  qualitySnapshot.outputLearningApplication ← copy from derivation at select   │
│  human_quality_evaluations: visualScore, factualPass, intent                  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Repository: listEvaluatedCorpusWithEvaluations (existing)                     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ impact/enrich.ts — buildImpactRows()                                           │
│  Per row: learningApplied, clientProfileId, mode, format, cohort, metrics   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ impact/aggregate.ts — slice by client|mode|format; split learned arms       │
│  intentMetrics: rejectRate, regenerateRate per arm                            │
│  visualMovementMetrics: meanVisualScore per arm; delta learned−non_learned    │
│  factualMetrics: factualPassRate per arm (separate bucket)                    │
│  insufficient_sample if global N < MIN or slice missing an arm                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│ LearningImpactReport JSON     │    │ GET /api/feedback/learning-impact       │
│  + 131-EVIDENCE.json (CI)     │    │  + HumanQualityCorpusPanel Impact tab   │
└──────────────────────────────┘    └──────────────────────────────────────┘
```

### Recommended Project Structure

```
app/src/server/human-quality/
├── corpus.ts                         # extend: OutputLearningApplicationSnapshot + sanitize
├── service.ts                        # extend: copy application into qualitySnapshot at select
├── calibration/                      # existing — do not merge impact into calibration report
├── impact/
│   ├── types.ts                      # ImpactRow, SliceComparison, LearningImpactReport
│   ├── enrich.ts                     # IMPACT-01 resolution per evaluated row
│   ├── aggregate.ts                  # IMPACT-02/03 slice + arm metrics
│   └── report.ts                     # IMPACT-04 status + bucket assembly
│   └── service.ts                    # runLearningImpact()
app/src/server/repositories/
├── human-quality-corpus.ts           # existing join — optional filter by learningApplied
app/drizzle/
├── 0045_derivation_output_learning_application.sql   # jsonb column on derivations
app/scripts/
├── run-learning-impact.ts
├── check-learning-impact-evidence.mjs
```

### Pattern 1: Bounded Application Snapshot (IMPACT-01)

**What:** Persist a privacy-safe, bounded snapshot when a derivation is created from an output-learning accept/edit flow; freeze into corpus `qualitySnapshot` at selection.

**When to use:** Every derivation create/regenerate path that may carry output-learning prefill; legacy rows default `applied: false, resolution: "not_recorded"`.

**Example:**

```typescript
// Source: [VERIFIED: output-learning/safety/types.ts AppliedLearningTrace subset]
export interface OutputLearningApplicationSnapshot {
  schemaVersion: 1;
  applied: boolean;
  resolution: "recorded" | "not_recorded" | "recommendation_only"; // no prefill reached generation
  traceId?: string;
  recommendationId?: string;
  primaryVariableKey?: string;
  algorithmVersion?: string;
  safetyVersion?: string;
  learningsSource: "postgres";
}

// Forbidden in snapshot (mirror corpus FORBIDDEN_PAYLOAD_KEYS):
// prompt, signedUrl, modelResponse, full AppliedLearningTrace entries with unbounded text
```

**Client threading:** `OutputLearningRecommendationCard` accept → `useDerivationFlow` → `StrategyRecipePanel` → derivations POST body includes optional validated `outputLearningApplication` [VERIFIED: accept flow `page.tsx:828`, `derivations/route.ts` — body today only `preview`/`styleAssetId`; extension required].

### Pattern 2: Comparable Slice Partitioning (IMPACT-02)

**What:** Group evaluated corpus rows by `clientProfileId`, `generationMode`, `format`; within each slice, partition into `learned` (`learningApplied === true`) and `non_learned` arms.

**When to use:** All cross-arm impact metrics; slices with only one arm return `comparability: "insufficient"` for that slice (no delta claimed).

**Example:**

```typescript
export interface ImpactSliceKey {
  clientProfileId: string;
  generationMode: string;
  format: string;
}

export interface ImpactArmMetrics {
  count: number;
  meanVisualScore: number | null;
  rejectIntentRate: number | null;      // intent === 'reject'
  regenerateIntentRate: number | null;  // intent === 'regenerate'
  factualPassRate: number | null;
}

export interface ImpactSliceComparison {
  sliceKey: string;
  learned: ImpactArmMetrics;
  nonLearned: ImpactArmMetrics;
  visualScoreDelta: number | null;       // learned.mean - nonLearned.mean; null if incomparable
  comparability: "ok" | "insufficient";
}
```

### Pattern 3: Metric Separation in Impact Report (IMPACT-03 / v12.5 locked)

**What:** Mirror Phase 128 `qualityMetrics`/`factualMetrics` and Phase 130 calibration buckets — add **`learningImpactMetrics`** as its own top-level section; never blend factual pass into visual movement conclusions.

**Example:**

```typescript
export interface LearningImpactReport {
  schemaVersion: 1;
  learningImpactVersion: string; // e.g. "1.0.0"
  capturedAt: string;
  status: "ok" | "insufficient_sample";
  evaluatedItemCount: number;
  learningImpactMetrics: {
    learnedCount: number;
    nonLearnedCount: number;
    slices: ImpactSliceComparison[];
    globalVisualScoreDelta: number | null; // weighted or simple mean of comparable slices only
  };
  intentMetrics: {
    learned: { rejectRate: number | null; regenerateRate: number | null };
    nonLearned: { rejectRate: number | null; regenerateRate: number | null };
  };
  visualMovementMetrics: {
    learnedMeanVisualScore: number | null;
    nonLearnedMeanVisualScore: number | null;
    deltaLearnedMinusNonLearned: number | null;
    cohortMovement?: {
      preLearningMean: number | null;
      postLearningMean: number | null;
      deltaPostMinusPre: number | null;
    };
  };
  factualMetrics: {
    learnedFactualPassRate: number | null;
    nonLearnedFactualPassRate: number | null;
    // factual pass cannot offset visual movement claims
  };
  rows: ImpactEvaluatedRow[]; // bounded list for drill-down; cap for API like calibration 100
}
```

### Pattern 4: Insufficient-Sample Honesty (IMPACT-04)

**What:** Mirror `insufficient_corpus` from Phase 130 — when gates fail, set `status: "insufficient_sample"`, null out movement deltas, and emit explicit `insufficientReasons[]`.

**Recommended thresholds (discretion, align Phase 130):**

| Gate | Threshold | Effect |
|------|-----------|--------|
| Global evaluated items | < 5 | `insufficient_sample` (entire report) |
| Per-slice arm | < 3 in learned OR non_learned | slice `comparability: "insufficient"`; exclude from global delta |
| Comparable slices for global delta | 0 slices with both arms ≥3 | `globalVisualScoreDelta: null` |

**Checker rule (mirror `check-score-calibration-evidence.mjs`):** Evidence with `status: "insufficient_sample"` must have `deltaLearnedMinusNonLearned === null` and must not contain `improvementClaimed: true`.

### Anti-Patterns to Avoid

- **Using Phase 128 fixture `qualityImprovementPathRate` as live impact:** Fixture proves pipeline wiring, not human corpus improvement [VERIFIED: `REQUIREMENTS.md:11`, `check-output-learning-evidence.mjs`].
- **Beta analytics as source of truth:** `output_learning_recommendation_accepted` lacks derivation linkage [VERIFIED: `OutputLearningRecommendationCard.tsx:98-110`].
- **Cohort label alone as `learningApplied`:** `post_learning` ≠ prefill applied; operator may label cohort without learning [VERIFIED: `corpus.ts:6-10`].
- **Blending factual pass into visual improvement:** Violates v12.5 locked decision and IMPACT-03 separation.
- **Claiming improvement with single-arm slices:** Violates IMPACT-04.
- **Storing full `AppliedLearningTrace` in corpus:** Unbounded; use bounded snapshot subset only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Evaluated corpus join | Raw SQL | `listEvaluatedCorpusWithEvaluations` | Phase 130 repo [VERIFIED: `human-quality-corpus.ts:58-62`] |
| Intent / visual / factual rates | Stats package | Pure TS reducers in `impact/aggregate.ts` | Small N; same as calibration |
| Application trace sanitization | Ad-hoc picks | Reuse `stripForbiddenPayloadKeys` + bounded field list | Phase 129 privacy boundary |
| Safety guard semantics | Duplicate guards | Import `OUTPUT_LEARNING_SAFETY_VERSION`, existing guard codes | v12.4 canonical |
| Evidence CI validation | Ad-hoc asserts | `check-learning-impact-evidence.mjs` | Phase 130 pattern |
| Auth for owner report | New auth system | `requireCalibrationAccess` or shared helper | Phase 130 dual auth |
| Hypothesis testing / p-values | Custom t-test | Descriptive deltas + `insufficient_sample` | Corpus size; audit honesty |

**Key insight:** Phase 131 is a **measurement and honesty** phase. v12.4 already ships recommendation + guards; Phase 131 proves whether that loop helps on the human corpus — without attribution instrumentation (IMPACT-01), the rest of the requirements are unplannable fiction.

## Common Pitfalls

### Pitfall 1: Missing Attribution (IMPACT-01 blocker)

**What goes wrong:** Impact report infers learning from cohort label or campaign CTA overlap with learnings.

**Why it happens:** No derivation-level persisted application today.

**How to avoid:** Persist bounded snapshot at derivation create; copy to corpus at selection; `resolution: "not_recorded"` for legacy rows.

**Warning signs:** 100% of rows show `learningApplied: false` or heuristic false positives.

### Pitfall 2: Conflating Calibration with Impact

**What goes wrong:** Extend `CalibrationReport` with learning deltas.

**Why it happens:** Same join source and UI surface.

**How to avoid:** Separate `LearningImpactReport` schema and API; optional adjacent tab in same panel.

**Warning signs:** `learningImpactMetrics` nested inside `visualMetrics` of calibration report.

### Pitfall 3: False Improvement from Small N

**What goes wrong:** `deltaLearnedMinusNonLearned: +12` from 1 learned vs 1 non-learned item.

**Why it happens:** Early corpus size.

**How to avoid:** Per-arm minimum 3; global minimum 5; `insufficient_sample` gates; checker validation.

**Warning signs:** Positive delta with `learnedCount < 3`.

### Pitfall 4: Factual–Visual Tradeoff Narrative

**What goes wrong:** "Learning improved visuals" while factual pass rate dropped — reported as net win.

**Why it happens:** Single headline metric pressure for milestone closure.

**How to avoid:** Separate `factualMetrics` bucket; Phase 133 QA-23 will store sections separately.

**Warning signs:** Combined `overallImpactScore` field.

### Pitfall 5: Performance-Learning vs Output-Learning Mix-up

**What goes wrong:** `NextExperimentRecommendationCard` (Mem0 performance) counted as output learning.

**Why it happens:** Similar UI pattern on campaign page [VERIFIED: `NextExperimentRecommendationCard.tsx`].

**How to avoid:** Only stamp `outputLearningApplication` from output-learning accept path; `learningsSource: "postgres"` + output-learning `traceId` prefix validation.

**Warning signs:** Performance recommendation `recommendationId` in output-learning snapshots.

## Code Examples

### Resolve learning applied from enriched corpus row

```typescript
// Source: [VERIFIED: pattern from calibration/compare.ts + new enrich.ts]
export function resolveLearningApplied(
  snapshot: HumanQualityQualitySnapshot & {
    outputLearningApplication?: OutputLearningApplicationSnapshot;
  }
): boolean {
  return snapshot.outputLearningApplication?.applied === true;
}

export function buildImpactRow(
  row: EvaluatedCorpusRow
): ImpactEvaluatedRow {
  const application = row.item.qualitySnapshot?.outputLearningApplication;
  return {
    corpusItemId: row.item.id,
    clientProfileId: row.item.clientProfileId,
    generationMode: row.item.generationMode,
    format: row.item.format,
    cohort: row.item.cohort,
    learningApplied: application?.applied === true,
    applicationResolution: application?.resolution ?? "not_recorded",
    visualScore: row.evaluation.visualScore,
    factualPass: row.evaluation.factualPass,
    intent: row.evaluation.intent,
  };
}
```

### Insufficient-sample report builder

```typescript
// Source: [VERIFIED: calibration/report.ts:85-102 pattern]
export const MIN_GLOBAL_IMPACT_ITEMS = 5;
export const MIN_ARM_SAMPLE = 3;

export function buildLearningImpactReport(
  rows: ImpactEvaluatedRow[],
  capturedAt: string
): LearningImpactReport {
  const hasSufficientGlobal = rows.length >= MIN_GLOBAL_IMPACT_ITEMS;
  // ... aggregate slices, compute deltas only when both arms >= MIN_ARM_SAMPLE
  return {
    schemaVersion: 1,
    learningImpactVersion: "1.0.0",
    capturedAt,
    status: hasSufficientGlobal ? "ok" : "insufficient_sample",
    evaluatedItemCount: rows.length,
    // learningImpactMetrics / intentMetrics / visualMovementMetrics / factualMetrics
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixture eval matrix only for quality claims | Human corpus + calibration (129–130) | v12.5 | Impact must use corpus, not matrix |
| Recommendation trace in API response only | Needs derivation + corpus persistence | Phase 131 | IMPACT-01 greenfield instrumentation |
| `insufficient_corpus` honesty | Extend to `insufficient_sample` for impact | Phase 130 pattern | Reuse thresholds and checker style |

**Deprecated/outdated:**
- Claiming v12.4 `qualityImprovementPathRate=1.0` as proof of live learning impact — explicitly insufficient per v12.5 scope [VERIFIED: `REQUIREMENTS.md:11`].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Derivations POST can accept optional bounded `outputLearningApplication` without breaking existing clients | Pattern 1 | Need migration-only corpus operator tagging fallback |
| A2 | ≥3 items per arm and ≥5 global is acceptable for `ok` status (mirrors Phase 130) | Pattern 4 | Thresholds may need user tuning for sparse corpus |
| A3 | `clientProfileId` on corpus items is the correct "client" dimension for IMPACT-02 | Pattern 2 | User may mean workspace — corpus already stores `clientProfileId` [VERIFIED: `0043_human_quality_corpus.sql:4`] |
| A4 | Learned vs non-learned comparison is primary; cohort movement is supplementary | Pattern 3 | User may want cohort-only — locked IMPACT-02 requires learned/non-learned split |

## Open Questions (RESOLVED)

1. **Regenerate path attribution**
   - What we know: Regenerate route exists; may create child derivations [VERIFIED: `regenerate/route.ts`].
   - **RESOLVED:** Copy parent `outputLearningApplication` on regenerate unless POST body includes a new application snapshot from a fresh recommendation accept. Child derivations inherit parent attribution by default (Plan 131-01 Task 2).

2. **Campaign-level batch derivations without per-job application**
   - What we know: `derivations/route.ts` creates multiple jobs from campaign config [VERIFIED: `derivations/route.ts:107-228`].
   - **RESOLVED:** Output-learning prefill applies via recipe campaign patch before batch — persist identical `outputLearningApplication` snapshot on every derivation job in the batch when POST includes application payload (Plan 131-01 Task 2).

3. **Historical corpus items without application metadata**
   - What we know: Existing evaluated items lack `outputLearningApplication` in snapshot.
   - **RESOLVED:** Treat as `resolution: "not_recorded"` / `learningApplied: false`; report includes `unlabeledCount`; do not backfill heuristically (Plan 131-02 enrich + Plan 131-03 report).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI + vitest | ✓ | v25.9.0 [VERIFIED: shell] | — |
| npm / vitest | Unit tests | ✓ | vitest 4.1.9 | — |
| Postgres + `TEST_DATABASE_URL` | Repository integration tests | ✓ optional | — | Unit tests with mocks (Phase 129 pattern) |
| Production DB for evidence CLI | `run-learning-impact.ts` | ✓ at dev runtime | — | Template JSON + checker `--skip-tests` |

**Missing dependencies with no fallback:** None for planning — implementation needs DB for real evidence capture (same as Phase 130).

**Missing dependencies with fallback:** Integration tests without `TEST_DATABASE_URL` — use mocked repository tests for pure impact functions.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/human-quality/impact` |
| Full suite command | `cd app && npm test && npm run lint && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMPACT-01 | Resolve `learningApplied` from bounded snapshot; sanitize forbidden keys | unit | `cd app && npm test -- tests/unit/human-quality/impact/enrich.test.ts -x` | ❌ Wave 0 |
| IMPACT-02 | Slice partition by client/mode/format; learned vs non-learned arms | unit | `cd app && npm test -- tests/unit/human-quality/impact/aggregate.test.ts -x` | ❌ Wave 0 |
| IMPACT-03 | Intent rates, visual delta, factual pass rate per arm | unit | `cd app && npm test -- tests/unit/human-quality/impact/report.test.ts -x` | ❌ Wave 0 |
| IMPACT-04 | `insufficient_sample` nulls deltas; checker rejects false claims | unit + script | `cd app && node scripts/check-learning-impact-evidence.mjs` | ❌ Wave 0 |
| IMPACT-01 | Derivation POST persists bounded application | integration | `cd app && npm test -- app/src/app/api/campaigns -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/human-quality/impact`
- **Per wave merge:** `cd app && npm test && npm run lint`
- **Phase gate:** Full suite + `check-learning-impact-evidence.mjs` green before `/gsd-verify-phase`

### Wave 0 Gaps

- [ ] `app/src/server/human-quality/impact/` module (types, enrich, aggregate, report, service)
- [ ] `tests/unit/human-quality/impact/*.test.ts`
- [ ] `app/drizzle/0045_derivation_output_learning_application.sql` (or equivalent)
- [ ] `app/scripts/run-learning-impact.ts` + `check-learning-impact-evidence.mjs`
- [ ] Extend `human-quality/corpus.ts` + `service.ts` for snapshot copy
- [ ] Thread application payload through output-learning accept → derivations POST
- [ ] `GET /api/feedback/learning-impact` + optional Impact tab on `HumanQualityCorpusPanel`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `requireCalibrationAccess` / platform-owner pattern for impact API |
| V3 Session Management | no | Read-only report routes |
| V4 Access Control | yes | Workspace-scoped corpus join; global rollup gated to owner/admin |
| V5 Input Validation | yes | Zod schema for `outputLearningApplication`; `stripForbiddenPayloadKeys` on corpus |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt/URL leakage via application snapshot | Information disclosure | Bounded snapshot schema; forbidden keys rejected at corpus boundary [VERIFIED: `corpus.ts:72-96`] |
| Unapproved learnings in attribution | Tampering | Only accept client-submitted trace IDs that reference postgres recommendation response; server re-validates `traceId` shape, not learning content |
| Cross-workspace corpus leakage in rollup | Elevation | Repository workspace filters on join [VERIFIED: Phase 129 isolation tests] |
| DoS via unbounded report payload | Denial of service | Cap drill-down rows at 100 with `truncated` flag [VERIFIED: `score-calibration/route.ts:8-50`] |

## Project Constraints (from .cursor/rules/)

- Use Context7 MCP for library documentation when implementing framework-specific APIs [VERIFIED: `context7.mdc`].
- Render platform rules apply to deployment only — not this measurement module [VERIFIED: `render-platform.mdc`].
- No `.cursor/rules/` project-specific coding directives beyond Context7 and Render notes were found in repo `.cursor/rules/` [VERIFIED: glob empty].

## Sources

### Primary (HIGH confidence)
- Codebase: `app/src/server/human-quality/*`, `app/src/server/output-learning/*`, `app/src/components/campaigns/OutputLearningRecommendationCard.tsx`, `app/drizzle/0043_human_quality_corpus.sql`, `app/scripts/run-score-calibration.ts`, `app/scripts/check-score-calibration-evidence.mjs`
- `.planning/REQUIREMENTS.md` — IMPACT-01–04 definitions
- `.planning/phases/129-CONTEXT.md`, `130-CONTEXT.md`, `130-RESEARCH.md` — phase boundaries and patterns
- npm registry — vitest 4.1.9

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — v12.5 locked decisions (no Phase 131 CONTEXT.md yet)

### Tertiary (LOW confidence)
- None stated as fact without codebase verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — mirrors Phase 130; no new dependencies
- Architecture: HIGH — gap analysis verified in derivation schema and accept flow
- Pitfalls: HIGH — insufficient-sample pattern proven in Phase 130

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (30 days — stable brownfield extension)
