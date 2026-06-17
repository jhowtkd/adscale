# Phase 130: Score Calibration and Rubric Alignment - Research

**Researched:** 2026-06-17
**Domain:** Human-vs-automatic quality score calibration, divergence reporting, versioned rubric/gate adjustment registry
**Confidence:** HIGH

## Summary

Phase 130 closes the **evidence gap** left intentionally by Phase 129: the human-quality corpus stores structured judgments and a point-in-time `qualitySnapshot.qualityScore`, but nothing yet compares those scores, surfaces systematic divergence, or turns patterns into auditable rubric/gate adjustment proposals [VERIFIED: `human-quality/corpus.ts:45-57`, `HumanQualityCorpusPanel.tsx` copy "no calibration claims yet"].

The brownfield stack already owns the scoring artifacts Phase 130 must calibrate against: `creative-score.ts` produces `qualityScore` (0–100), `creative-quality-gate.ts` classifies hard failures and verdict, `creative-score-ceilings.ts` enforces numeric caps from failure codes, and `observable-rubric.ts` owns shared QA/score rubric prose [VERIFIED: codebase grep]. Phase 121 added server-side ceilings; Phase 119 added observable rubric injection; Phase 46 established factual vs visual separation at the gate [VERIFIED: `121-RESEARCH.md`, `119-RESEARCH.md`, `46-CONTEXT.md`]. v12.4 Phase 128 established the **metric separation pattern** this phase must mirror: `qualityMetrics` and `factualMetrics` live in separate JSON sections and are never blended for pass/fail [VERIFIED: `128-EVIDENCE.json`, `check-output-learning-evidence.mjs:99`].

**Primary recommendation:** Add a pure TypeScript calibration module under `app/src/server/human-quality/calibration/` that joins evaluated corpus rows with evaluations, computes per-item and grouped divergence metrics, emits a versioned calibration report (JSON + optional owner API), and persists **proposed** rubric/gate adjustments in Postgres with explicit `adjustmentVersion` and corpus evidence refs. Do **not** re-score live derivations or change prompts/gate classifiers in this phase — Phase 132 applies accepted proposals; Phase 133 runs the release gate.

<user_constraints>
## User Constraints (from STATE.md + Phase 129 boundary — no Phase 130 CONTEXT.md)

### Locked Decisions
- [v12.5]: Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- [v12.5]: Calibrate automatic scoring against human judgment while keeping factual metrics separate.
- [v12.5]: Keep factual metrics separate from visual quality and learning-impact metrics.
- [Phase 129]: Corpus inclusion is explicit/manual; evaluation in owner/feedback internal queue; admin/technical reviewer only.
- [Phase 129]: Human visual score 0–100; factual pass/fail stored separately — must not be blended into visual score.
- [Phase 129]: `qualitySnapshot` captured at selection time includes automatic `qualityScore`, verdict, hard failures, score issues.
- [Phase 129]: Postgres is canonical source of truth for corpus; no Mem0/analytics as quality source of truth.
- [Phase 129]: Phase 129 does **not** calibrate scoring, measure learning impact, change prompt/gate/rubric behavior, or define release gate.
- [v12.3]: Accepted visual-quality gap remains `meanQualityScore 70.17 < 75`; factual fidelity baseline must remain 1.0 in any new release gate.

### Claude's Discretion
- Exact module/file names (`calibration.ts` vs `score-calibration.ts`), route paths, and evidence JSON location under `.planning/phases/130-*`.
- Minimum evaluated corpus sample size before reporting aggregate divergence vs returning `insufficient_corpus` (recommend ≥3 per slice, ≥5 global — mirror IMPACT-04 honesty pattern).
- Whether adjustment proposals are owner-API only or also CLI-generated in `app/scripts/run-score-calibration.ts`.
- Divergence thresholds for flagging systematic over/under-scoring (recommend |delta| ≥ 15 as review flag, not hard fail).
- Plan wave count (2–3 plans): calibration core + evidence script vs adjustment registry + owner report surface.

### Deferred Ideas (OUT OF SCOPE)
- Learning impact measurement (Phase 131 — IMPACT-*).
- Applying prompt/gate/rubric code changes from proposals (Phase 132 — QUALITY-*).
- Milestone release gate orchestration (Phase 133 — QA-22–24).
- Re-scoring corpus derivations with current analyzers (stale snapshot comparison is intentional; live re-score deferred).
- Workspace-member/external reviewer workflows.
- Owner dashboard trend lines.
- ML model calibration (Platt scaling, isotonic regression) — corpus size and audit needs do not justify it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALIB-01 | Automatic quality score compared to human visual score for every evaluated corpus item | Join `human_quality_corpus_items` (status=`evaluated`) with `human_quality_evaluations`; compare `quality_snapshot.qualityScore` vs `visual_score`; per-item `scoreDelta` in report |
| CALIB-02 | Calibration report groups systematic divergences by failure type, mode and format | `groupBy(primaryFailureReason, generationMode, format)` aggregation; include count, mean delta, over/under-score counts per group |
| CALIB-03 | Gate/rubric adjustments versioned and backed by corpus evidence | Postgres `rubric_calibration_adjustments` (or equivalent) + `RUBRIC_CALIBRATION_VERSION` constant; each row cites `corpusItemId`s and grouped stats — status `proposed` until Phase 132 applies |
| CALIB-04 | Factual fidelity measured separately; cannot be traded for visual score | Separate `factualMetrics` section in report; never compute visual pass from factual pass; flag items where high auto/human visual score coexists with `factualPass: false` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-item score comparison (CALIB-01) | API / Backend (`human-quality/calibration`) | Repository join query | Comparison is server-side aggregation over canonical Postgres rows |
| Grouped divergence report (CALIB-02) | API / Backend (`human-quality/calibration`) | CLI evidence script | Pure functions testable without UI; script writes phase evidence JSON |
| Versioned adjustment registry (CALIB-03) | Database / Storage (Postgres) | API / Backend service | Adjustments must be auditable and survive deploys; not git-only anecdotes |
| Factual metric separation (CALIB-04) | API / Backend (report schema) | — | Same bucket pattern as Phase 128 `qualityMetrics` / `factualMetrics` |
| Owner calibration report UI | Browser / Client (optional) | API route | Discretion — CLI + JSON may suffice for v12.5 internal operator; thin read-only panel acceptable |
| Prompt/gate code changes | — (Phase 132) | — | Phase 130 registers proposals only |
| Live derivation re-scoring | — (out of scope) | — | Snapshot-at-selection is the audit contract |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project pin | Calibration math, types, report builders | Brownfield; all upstream modules are TS |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Unit tests for pure calibration functions | Phases 119–129 pattern; `app/config/vitest.config.ts` |
| Drizzle ORM | project pin | Join evaluated corpus + evaluations; adjustment table | Phase 129 corpus already on Drizzle |
| Zod | project pin | API request/response validation | Phase 129 evaluation routes |
| `human-quality/corpus.ts` | — | Failure reason enums, snapshot shape | Canonical human taxonomy |
| `creative-score-ceilings.ts` | — | Current ceiling table for adjustment targets | CALIB-03 proposals reference `SCORE_CEILING_BY_FAILURE` |
| `observable-rubric.ts` | — | Rubric sections for adjustment targets | CALIB-03 proposals reference rubric constants |
| `creative-quality-taxonomy.ts` | — | Gate hard-failure codes | Bridge human reasons → gate codes |
| `creative-validation-aggregation.ts` | — | `FIDELITY_HARD_FAILURE_CODES` pattern | CALIB-04 factual bucket definition |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | project pin | CLI scripts importing `@/server/*` | Mirror `check-output-learning-evidence.mjs` + `tsx -e` pattern |
| Node `fs` + JSON evidence files | — | Phase evidence under `.planning/phases/130-*` | CI-checkable calibration artifacts (Phase 133 gate) |
| Drizzle `innerJoin` | — | Evaluated item + latest evaluation | Repository `listEvaluatedCorpusWithEvaluations` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres adjustment registry | Git-only adjustment markdown | Not queryable; fails CALIB-03 audit requirement |
| Re-score derivations at report time | Frozen `qualitySnapshot` | Breaks audit trail; selection-time auto score is the comparison baseline |
| `simple-statistics` / `ml-regression` npm packages | Pure TS mean/MAE/count | Corpus N is small; adds dep for trivial math |
| Immediate gate/rubric code edits in 130 | Proposal registry + Phase 132 apply | Violates phase boundary; mixes measurement with creative changes |
| Blender human + auto into one pass metric | Separate `visualMetrics` + `factualMetrics` | Violates CALIB-04 and v12.5 locked decision |

**Installation:** None — no new npm dependencies.

**Version verification:** `npm view vitest version` → 4.1.9 (2026-06-17); `app/package.json` pins `^4.1.5`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 129 data (already persisted)                                          │
│  human_quality_corpus_items (status=evaluated, quality_snapshot)            │
│  human_quality_evaluations (visual_score, factual_pass, failure_reason)     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Repository: listEvaluatedCorpusWithEvaluations(workspaceId, filters?)        │
│  INNER JOIN items + evaluations on corpus_item_id                           │
│  Filter: status = 'evaluated'; quality_snapshot.qualityScore IS NOT NULL  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ calibration/compare.ts — buildCalibrationComparisons()                       │
│  Per item: autoScore, humanVisualScore, scoreDelta, absError                │
│  Attach: generationMode, format, primaryFailureReason, factualPass          │
│  Attach: snapshot hardFailures / qualityVerdict (bounded, from snapshot)    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│ calibration/aggregate.ts      │    │ calibration/adjustments.ts            │
│  Group by failure/mode/format │    │  Detect systematic divergence patterns│
│  visualMetrics: MAE, bias, n  │    │  Create proposed adjustment rows      │
│  factualMetrics: pass rate    │    │  adjustmentVersion + evidence refs    │
│  insufficient_corpus if n low │    │  target: ceiling | rubric | gate      │
└──────────────┬───────────────┘    └──────────────────┬───────────────────┘
               │                                        │
               ▼                                        ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│ CalibrationReport JSON        │    │ rubric_calibration_adjustments (PG)   │
│  + 130-EVIDENCE.json (CI)     │    │  status: proposed (132 applies)       │
└──────────────┬───────────────┘    └──────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Optional: GET owner API / UI    │
│  Platform-owner read-only view  │
└──────────────────────────────┘
```

### Recommended Project Structure

```
app/src/server/human-quality/
├── corpus.ts                    # existing — extend with failure→gate bridge map
├── service.ts                   # existing
├── calibration/
│   ├── types.ts                 # CalibrationComparison, GroupSlice, Report
│   ├── compare.ts               # per-item comparison (CALIB-01)
│   ├── aggregate.ts             # grouped divergence + factual bucket (CALIB-02,04)
│   ├── adjustments.ts           # proposal builder (CALIB-03)
│   └── failure-bridge.ts        # human reason ↔ gate code mapping
app/src/server/repositories/
├── human-quality-corpus.ts      # add listEvaluated*, adjustment CRUD
app/scripts/
├── run-score-calibration.ts     # generate report + evidence JSON
├── check-score-calibration-evidence.mjs  # CI validator (Phase 133 precursor)
app/drizzle/
├── 0044_rubric_calibration_adjustments.sql
```

### Pattern 1: Point-in-Time Snapshot Comparison (CALIB-01)

**What:** Compare `qualitySnapshot.qualityScore` frozen at corpus selection against `evaluation.visualScore` — do not call `analyzeDerivationCreative` again.

**When to use:** Always for CALIB-01 auditability; re-scoring is a different experiment.

**Example:**

```typescript
// Pattern: per-item comparison from joined corpus row
export interface CalibrationComparison {
  corpusItemId: string;
  derivationId: string;
  generationMode: string;
  format: string;
  cohort: string;
  automaticQualityScore: number | null;
  humanVisualScore: number;
  scoreDelta: number | null; // automatic - human; null if auto missing
  absError: number | null;
  primaryFailureReason: HumanQualityFailureReason;
  factualPass: boolean;
  qualityVerdict: string | null;
  hardFailureCodes: string[];
}

export function buildComparison(
  item: EvaluatedCorpusRow,
  evaluation: HumanQualityEvaluation
): CalibrationComparison {
  const auto = item.qualitySnapshot?.qualityScore ?? null;
  const human = evaluation.visualScore;
  const scoreDelta = auto === null ? null : auto - human;
  return {
    corpusItemId: item.id,
    derivationId: item.derivationId,
    generationMode: item.generationMode,
    format: item.format,
    cohort: item.cohort,
    automaticQualityScore: auto,
    humanVisualScore: human,
    scoreDelta,
    absError: scoreDelta === null ? null : Math.abs(scoreDelta),
    primaryFailureReason: evaluation.primaryFailureReason,
    factualPass: evaluation.factualPass,
    qualityVerdict: item.qualitySnapshot?.qualityVerdict ?? null,
    hardFailureCodes: (item.qualitySnapshot?.hardFailures ?? [])
      .map((f) => f.code)
      .filter(Boolean) as string[],
  };
}
```

### Pattern 2: Metric Separation in Report Schema (CALIB-04)

**What:** Mirror Phase 128 evidence structure — visual calibration metrics never include factual pass rate as a compensating signal.

**When to use:** Every report write and evidence JSON schema.

**Example:**

```typescript
export interface CalibrationReport {
  schemaVersion: 1;
  rubricCalibrationVersion: string; // e.g. "1.0.0"
  capturedAt: string;
  status: "ok" | "insufficient_corpus";
  evaluatedItemCount: number;
  visualMetrics: {
    meanAbsError: number | null;
    meanSignedDelta: number | null; // positive = auto over-scores vs human
    overScoreCount: number; // delta > threshold
    underScoreCount: number; // delta < -threshold
    divergenceByFailureReason: Record<string, GroupSlice>;
    divergenceByMode: Record<string, GroupSlice>;
    divergenceByFormat: Record<string, GroupSlice>;
    comparisons: CalibrationComparison[];
  };
  factualMetrics: {
    factualPassRate: number | null;
    factualFailCount: number;
    highVisualButFactualFail: CalibrationComparison[]; // CALIB-04 guard list
  };
  adjustments: AdjustmentProposalSummary[];
}
```

### Pattern 3: Human Failure Reason → Gate Code Bridge

**What:** Explicit map connecting Phase 129 human taxonomy to gate/rubric targets for grouped divergence and adjustment proposals.

**When to use:** Grouping, adjustment `targetKey` resolution, cross-checking snapshot `hardFailures`.

| Human `primaryFailureReason` | Gate / rubric targets [VERIFIED: `corpus.ts:26-35`, `creative-quality-gate.ts:42-58`] |
|------------------------------|----------------------------------------------------------------------------------------|
| `visual_overload` | `visual_overload`, `VISUAL_OVERLOAD_RUBRIC` |
| `weak_hierarchy` | `missing_dominant_idea`, `MISSING_DOMINANT_IDEA_MARKERS` |
| `generic_template_feel` | `generic_template_aesthetic`, `GENERIC_TEMPLATE_RUBRIC` |
| `illegible_cta` | `unreadable_required_text`, `cta_drift` |
| `unfocused_composition` | `missing_dominant_idea`, `decorative_only_variation` |
| `factual_issue` | `FIDELITY_HARD_FAILURE_CODES` — **factual bucket only** |
| `format_or_crop_issue` | `invalid_format_layout`, `cropped_critical_content` |
| `other` | report-only; no auto adjustment without manual review |

### Pattern 4: Versioned Adjustment Proposals (CALIB-03)

**What:** Persist proposals with semver-style `adjustmentVersion`, corpus evidence refs, and explicit target — mirror `OUTPUT_LEARNING_ALGORITHM_VERSION` + evidence ref pattern [VERIFIED: `output-learning/types.ts:1`, `aggregate.ts:30-54`].

**When to use:** When grouped divergence exceeds threshold and slice has minimum sample count.

**Proposal types:**

| `targetModule` | Example `targetKey` | Example change |
|----------------|--------------------|----------------|
| `score_ceiling` | `visual_overload` | Lower ceiling from 55 → 50 when mean over-score ≥ 15 |
| `observable_rubric` | `VISUAL_OVERLOAD_RUBRIC` | Tighten zone-count language when humans flag overload but auto score > 70 |
| `gate_classifier` | `generic_template_aesthetic` | Note pattern threshold — **proposal only**; Phase 132 edits taxonomy |

**Status lifecycle:** `proposed` (130) → `accepted` / `superseded` (132+) — do not auto-apply in 130.

### Anti-Patterns to Avoid

- **Re-scoring corpus derivations:** Breaks audit comparison against selection-time snapshot.
- **Blending factual into visual pass:** e.g. `overallPass = factualPass && visualScore > 75` — violates CALIB-04.
- **Using pending corpus items:** Only `status = 'evaluated'` rows with evaluation join.
- **Anecdotal adjustments without corpus IDs:** CALIB-03 requires `evidenceRefs: { corpusItemId, scoreDelta }[]`.
- **Changing `observable-rubric.ts` in Phase 130:** Register proposal; Phase 132 applies code edit.
- **Claiming calibration closed with N=1:** Return `insufficient_corpus` honestly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL join evaluated items + evaluations | Raw SQL strings | Drizzle `innerJoin` on `corpus_item_id` | Workspace scoping, type safety, repo pattern |
| MAE / grouped means | Import stats library | Pure TS reducers in `aggregate.ts` | N is small; trivial math |
| Report persistence for CI | Ad-hoc markdown only | JSON evidence + `check-score-calibration-evidence.mjs` | Phase 123/128 reproducibility pattern |
| Factual fidelity classification | New regex set | `FIDELITY_HARD_FAILURE_CODES` from `creative-validation-aggregation.ts` | Single fidelity definition |
| Score ceiling knowledge | Duplicate table | Import `SCORE_CEILING_BY_FAILURE` | Phase 121 already canonical |
| Human failure enums | String literals | `HUMAN_QUALITY_FAILURE_REASONS` | Phase 129 contract |
| ML calibration (Platt/isotonic) | sklearn port | Grouped bias report + threshold proposals | Corpus size, auditability, no training pipeline |

**Key insight:** Phase 130 is an **evidence and registry** phase, not a model-training phase. The product already has deterministic ceilings and rubric modules — calibration should measure divergence against human judgment and version **proposals** that cite corpus rows, not introduce a parallel scoring system.

## Common Pitfalls

### Pitfall 1: Stale Snapshot Confusion

**What goes wrong:** Operators expect calibration to use live derivation `qualityScore` after later gate changes.

**Why it happens:** Derivation row updates after corpus selection; snapshot is intentional freeze.

**How to avoid:** Document in report metadata `snapshotCapturedAt: item.selectedAt`; never overwrite snapshot during calibration.

**Warning signs:** Per-item delta shifts when re-running report without new corpus selections.

### Pitfall 2: Factual–Visual Conflation (CALIB-04)

**What goes wrong:** A high human visual score on a factually failed item "offsets" factual failure in aggregate pass metrics.

**Why it happens:** Single combined quality index is tempting for milestone closure.

**How to avoid:** Separate `visualMetrics` and `factualMetrics`; include `highVisualButFactualFail` explicit list; factual pass rate never mixed into visual MAE.

**Warning signs:** One `overallQualityPass` field in report schema.

### Pitfall 3: Small Sample Overfitting

**What goes wrong:** Adjustment proposals from 1–2 items in a mode/format slice.

**Why it happens:** Early corpus is small.

**How to avoid:** `MIN_SLICE_SAMPLE = 3` (discretion) before slice-level proposals; global `insufficient_corpus` below 5 evaluated items.

**Warning signs:** Proposals for `restyling` + `9:16` with `evidenceCount: 1`.

### Pitfall 4: Human–Gate Taxonomy Mismatch

**What goes wrong:** Grouping by `primaryFailureReason` does not align with `hardFailures` in snapshot — divergent stories.

**Why it happens:** Human judgment uses UX-oriented reasons; gate uses classifier codes.

**How to avoid:** `failure-bridge.ts` map; report both human reason groups and mapped gate codes; flag `humanGateMismatch` when human says `factual_issue` but snapshot has no fidelity code.

**Warning signs:** Adjustment targets `visual_overload` ceiling but human reason was `weak_hierarchy` only.

### Pitfall 5: Phase Creep into Prompt/Gate Edits

**What goes wrong:** Phase 130 PR changes `observable-rubric.ts` or gate classifiers to "fix" calibration.

**Why it happens:** Obvious fix while analyzing divergence.

**How to avoid:** Store proposals in `rubric_calibration_adjustments`; defer code edits to Phase 132 per QUALITY-02.

**Warning signs:** Diff in `creative-quality-gate.ts` during 130.

### Pitfall 6: Missing Evaluated-Only Filter

**What goes wrong:** Pending items without evaluation skew aggregates.

**Why it happens:** Repository only had `listPendingCorpusItems` [VERIFIED: `human-quality-corpus.ts:115-128`].

**How to avoid:** New `listEvaluatedCorpusWithEvaluations` with `status = 'evaluated'` and inner join.

**Warning signs:** `evaluatedItemCount` ≠ `comparisons.length`.

## Code Examples

### Grouped divergence slice

```typescript
// Source: pattern from creative-validation-aggregation.ts + output-learning aggregate
export interface GroupSlice {
  count: number;
  meanSignedDelta: number | null;
  meanAbsError: number | null;
  overScoreCount: number;
  underScoreCount: number;
}

const DIVERGENCE_FLAG_THRESHOLD = 15;

export function aggregateGroup(
  comparisons: CalibrationComparison[]
): GroupSlice {
  const withDelta = comparisons.filter((c) => c.scoreDelta !== null);
  if (withDelta.length === 0) {
    return { count: 0, meanSignedDelta: null, meanAbsError: null, overScoreCount: 0, underScoreCount: 0 };
  }
  const deltas = withDelta.map((c) => c.scoreDelta as number);
  const meanSignedDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const meanAbsError = deltas.reduce((a, d) => a + Math.abs(d), 0) / deltas.length;
  return {
    count: withDelta.length,
    meanSignedDelta,
    meanAbsError,
    overScoreCount: deltas.filter((d) => d > DIVERGENCE_FLAG_THRESHOLD).length,
    underScoreCount: deltas.filter((d) => d < -DIVERGENCE_FLAG_THRESHOLD).length,
  };
}
```

### Factual guard list (CALIB-04)

```typescript
import { FIDELITY_HARD_FAILURE_CODES } from "@/server/ai/creative-validation-aggregation";
import type { CreativeHardFailureCode } from "@/server/ai/creative-quality-gate";

export function isFactualSlice(comparison: CalibrationComparison): boolean {
  if (!comparison.factualPass) return true;
  return comparison.hardFailureCodes.some((code) =>
    FIDELITY_HARD_FAILURE_CODES.has(code as CreativeHardFailureCode)
  );
}

export function highVisualButFactualFail(
  comparisons: CalibrationComparison[],
  visualThreshold = 70
): CalibrationComparison[] {
  return comparisons.filter(
    (c) =>
      !c.factualPass &&
      c.humanVisualScore >= visualThreshold &&
      (c.automaticQualityScore ?? 0) >= visualThreshold
  );
}
```

### Evidence checker invocation (mirror Phase 128)

```bash
# Generate report from DB (operator / CI with DATABASE_URL)
cd app && npx tsx scripts/run-score-calibration.ts --workspace-id <uuid> --out ../.planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.json

# Validate evidence schema + metric separation
node app/scripts/check-score-calibration-evidence.mjs --evidence .planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.json
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixture-only quality evidence (v12.4) | Human corpus + calibration (v12.5) | Phase 129–130 | Real perceived quality drives rubric alignment |
| Prompt-only score caps (`SCORE VISUAL QUALITY CAPS`) | Server-side `applyScoreCeilings` | Phase 121 | Code ceilings exist; calibration tunes them with evidence |
| Subjective QA export-softening | Observable rubric with defect notes | Phase 119 | Calibration compares human judgment to same rubric era |
| Single combined release metric | Separated quality/factual JSON buckets | Phase 128 | CALIB-04 must follow same separation |
| No human-quality join API | Evaluated corpus join + report | Phase 130 (planned) | CALIB-01–03 |

**Deprecated/outdated:**
- Treating `meanQualityScore 70.17` from fixture matrix as sufficient human-quality proof — v12.5 explicitly rejects this [VERIFIED: `REQUIREMENTS.md:11`, `STATE.md:40-41`].
- Auto-enrolling derivations into corpus — Phase 129 locked manual selection only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `qualitySnapshot.qualityScore` at selection time is the correct automatic score for CALIB-01 | Pattern 1 | Re-scoring policy would change comparison semantics |
| A2 | Minimum 5 global evaluated items before `status: ok` report | Pattern 2 | Too strict blocks early operator feedback; too loose enables false calibration claims |
| A3 | Phase 130 stores proposals only; Phase 132 applies code changes | Anti-patterns | If user expects immediate gate fixes in 130, plan scope must be renegotiated |
| A4 | One evaluation per corpus item (latest row) | Repository | Multiple evaluations per item would need "latest" or "primary" selection rule |
| A5 | `|delta| ≥ 15` is a useful divergence flag threshold | aggregate.ts | Threshold may need operator tuning after first corpus batch |

## Open Questions

1. **Owner UI vs CLI-only for calibration report?**
   - What we know: Phase 129 owner panel exists; calibration is internal/operator workflow.
   - What's unclear: Whether Phase 130 needs a read-only panel or evidence JSON suffices until Phase 133.
   - Recommendation: Ship pure module + CLI + optional GET API in 130; thin read-only panel as discretion if planner wants operator UX.

2. **Cross-workspace aggregation for milestone evidence?**
   - What we know: Corpus is workspace-scoped; v12.5 milestone may need global evidence.
   - What's unclear: Platform-owner multi-workspace rollup in one report.
   - Recommendation: Per-workspace report first; platform-owner `--all-workspaces` flag as optional script enhancement.

3. **Adjustment auto-generation rules vs human-approved proposals?**
   - What we know: CALIB-03 requires versioned evidence-backed adjustments.
   - What's unclear: Whether proposals are auto-created from divergence rules or operator-triggered.
   - Recommendation: Auto-propose when slice `meanSignedDelta` exceeds threshold AND `count ≥ MIN_SLICE_SAMPLE`; operator accepts in Phase 132.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Scripts, vitest | ✓ | v25.9.0 | — |
| npm | test/lint/build | ✓ | (project) | — |
| PostgreSQL | Corpus queries, adjustment table | ✗ (local) | — | CI/dev `DATABASE_URL`; unit tests mock repository |
| Vitest | Calibration unit tests | ✓ | ^4.1.5 / registry 4.1.9 | — |
| tsx | `run-score-calibration.ts` | ✓ | project devDep | `npx tsx` |

**Missing dependencies with no fallback:**
- Live DB for operator calibration run — requires deployed or local Postgres with evaluated corpus rows (human verification from Phase 129).

**Missing dependencies with fallback:**
- Local Postgres missing — repository layer fully mockable in vitest (Phase 129 pattern).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/human-quality/calibration` |
| Full suite command | `cd app && npm test && npm run lint && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALIB-01 | Per-item auto vs human comparison | unit | `npm test -- tests/unit/human-quality/calibration/compare.test.ts -x` | ❌ Wave 0 |
| CALIB-01 | Null auto score handled | unit | same | ❌ Wave 0 |
| CALIB-02 | Group by failure/mode/format | unit | `npm test -- tests/unit/human-quality/calibration/aggregate.test.ts -x` | ❌ Wave 0 |
| CALIB-02 | `insufficient_corpus` when n below minimum | unit | same | ❌ Wave 0 |
| CALIB-03 | Adjustment proposal includes version + evidence refs | unit | `npm test -- tests/unit/human-quality/calibration/adjustments.test.ts -x` | ❌ Wave 0 |
| CALIB-03 | Repository persists adjustment row | unit | `npm test -- tests/unit/human-quality/calibration-adjustments-repository.test.ts -x` | ❌ Wave 0 |
| CALIB-04 | `factualMetrics` separate from `visualMetrics` | unit | `npm test -- tests/unit/human-quality/calibration/aggregate.test.ts -x` | ❌ Wave 0 |
| CALIB-04 | `highVisualButFactualFail` populated correctly | unit | same | ❌ Wave 0 |
| CALIB-01–04 | Evidence schema validation | integration | `node app/scripts/check-score-calibration-evidence.mjs --evidence .planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.template.json` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/human-quality/calibration`
- **Per wave merge:** `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus`
- **Phase gate:** `cd app && npm test && npm run lint && npm run build`

### Wave 0 Gaps

- [ ] `app/src/server/human-quality/calibration/compare.ts` — CALIB-01
- [ ] `app/src/server/human-quality/calibration/aggregate.ts` — CALIB-02, CALIB-04
- [ ] `app/src/server/human-quality/calibration/adjustments.ts` — CALIB-03
- [ ] `app/src/server/human-quality/calibration/failure-bridge.ts` — grouping bridge
- [ ] `app/tests/unit/human-quality/calibration/*.test.ts` — requirement coverage
- [ ] `app/drizzle/0044_rubric_calibration_adjustments.sql` — adjustment registry
- [ ] `listEvaluatedCorpusWithEvaluations` in repository — join evaluated rows
- [ ] `app/scripts/run-score-calibration.ts` + `check-score-calibration-evidence.mjs` — evidence pattern
- [ ] `130-EVIDENCE.template.json` — schema contract for Phase 133 gate

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Platform-owner auth on calibration API routes (mirror Phase 129 corpus routes) |
| V3 Session Management | no | Uses existing session |
| V4 Access Control | yes | Workspace-scoped queries; owner-only cross-workspace rollup if added |
| V5 Input Validation | yes | Zod on API; workspace ID validation |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace corpus leakage | Information disclosure | `workspaceId` filter on all joins (Phase 129 pattern) |
| Unbounded report payload | DoS | Cap comparisons array in API response; paginate or summarize for UI |
| Prompt/snapshot leakage via calibration | Information disclosure | Reuse `FORBIDDEN_PAYLOAD_KEYS`; report cites IDs not raw prompts |
| Unauthorized adjustment writes | Tampering | Platform-owner only; proposals audit-logged with `reviewerUserId` |

## Project Constraints (from .cursor/rules/)

No project-local `.cursor/rules/` directory found in workspace [VERIFIED: glob 2026-06-17]. Global rules apply: Context7 for library docs; Render ephemeral filesystem (calibration evidence in `.planning/` or Postgres, not local-only production state); no secrets in evidence JSON.

## Sources

### Primary (HIGH confidence)
- `app/src/server/human-quality/corpus.ts` — snapshot contract, failure reasons, visual/factual separation
- `app/src/server/repositories/human-quality-corpus.ts` — current repository surface (pending-only list)
- `app/src/server/ai/creative-score-ceilings.ts` — `SCORE_CEILING_BY_FAILURE`
- `app/src/server/ai/observable-rubric.ts` — rubric sections
- `app/src/server/ai/creative-validation-aggregation.ts` — `FIDELITY_HARD_FAILURE_CODES`, aggregate pattern
- `app/scripts/check-output-learning-evidence.mjs` — metric separation + evidence checker pattern
- `.planning/phases/129-live-human-quality-corpus/129-VERIFICATION.md` — Phase 129 delivered artifacts
- `.planning/phases/121-score-ceilings-and-retry/121-RESEARCH.md` — ceiling architecture
- `.planning/REQUIREMENTS.md` — CALIB-01–04 definitions

### Secondary (MEDIUM confidence)
- `.planning/phases/128-evaluation-and-release-gate/128-EVIDENCE.json` — quality/factual JSON bucket shape
- `.planning/phases/46-hard-quality-gate/46-CONTEXT.md` — gate semantics and factual/visual separation origin

### Tertiary (LOW confidence)
- None stated as fact without codebase verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield modules verified; no new dependencies
- Architecture: HIGH — clear phase boundaries; Phase 129 data contract supports join
- Pitfalls: MEDIUM — sample size thresholds and UI scope are discretion (A2, A3, Open Q1)

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (30 days — stable domain, new phase)
