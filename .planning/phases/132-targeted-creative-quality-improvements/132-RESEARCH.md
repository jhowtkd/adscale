# Phase 132: Targeted Creative Quality Improvements - Research

**Researched:** 2026-06-17
**Domain:** Evidence-bound application of rubric/gate/ceiling/prompt improvements for proven visual-quality failures while preserving v12.3 factual hard failures and v12.4 learning safety guards
**Confidence:** HIGH

## Summary

Phase 132 is the **apply** phase deferred from Phase 130: `rubric_calibration_adjustments` rows exist with `status: 'proposed'`, `failure-bridge.ts` maps human failure reasons to `score_ceiling | observable_rubric | gate_classifier` targets, but **no code path accepts proposals or edits** `creative-score-ceilings.ts`, `observable-rubric.ts`, or `creative-quality-gate.ts` yet [VERIFIED: `rubric-calibration-adjustments.ts` — insert/list/find only; `130-03-SUMMARY.md:95`]. Phase 130 explicitly left gate/rubric source modules untouched.

The five visual failure reasons from v12.3 (`visual_overload`, `weak_hierarchy`, `generic_template_feel`, `illegible_cta`, `unfocused_composition`) are already **first-class** in Postgres, the owner evaluation UI, and `failure-bridge.ts` [VERIFIED: `corpus.ts:26-35`, `HumanQualityCorpusPanel.tsx:131-134`, `schema.ts:1671-1677`]. QUALITY-01 is largely satisfied at the taxonomy layer; Phase 132 must strengthen **detection alignment** (gate markers, rubric prose, ceilings, regeneration directives) so human-flagged failures are caught earlier without weakening factual fidelity.

**Primary recommendation:** Ship a 3–4 plan wave: (1) **accept + apply pipeline** that promotes `proposed` → `accepted` adjustments with an auditable change log and bumps `RUBRIC_CALIBRATION_VERSION`; (2) **evidence-bound module edits** only for accepted proposals whose `evidenceRefs.corpusItemIds` meet Phase 130 thresholds; (3) **regression gate** re-running v12.3 factual matrix + v12.4 output-learning safety tests; (4) **re-evaluation report** comparing targeted failure-reason frequency (human corpus slices + deterministic gate fixtures) before vs after. Do not auto-apply numeric deltas from rationale strings — human/operator accept + bounded code edits per `targetModule`/`targetKey`.

<user_constraints>
## User Constraints (from STATE.md + Phase 129–131 boundaries — no Phase 132 CONTEXT.md)

### Locked Decisions
- [v12.5]: Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- [v12.5]: Calibrate automatic scoring against human judgment while keeping factual metrics separate.
- [v12.5]: Attack proven visual-quality failures: overload, weak hierarchy, generic template feel, illegible CTA, unfocused composition.
- [v12.5]: Keep factual metrics separate from visual quality and learning-impact metrics.
- [Phase 129]: Corpus inclusion explicit/manual; human visual score 0–100; factual pass/fail separate; closed primary failure reason enum; Postgres canonical.
- [Phase 130]: Auto-propose adjustments at |delta| ≥ 15 with min 3 items per slice; status `proposed` only — **Phase 132 applies accepted proposals**.
- [Phase 130]: `factual_issue` slices target `gate_classifier` only — no score_ceiling auto-proposals for factual bucket.
- [Phase 130]: Dedupe proposals by `slice_key + adjustmentVersion + target_module + target_key`.
- [Phase 130]: Do not re-score corpus derivations — frozen `qualitySnapshot` is audit baseline for calibration.
- [Phase 131]: Learning impact measured separately; `insufficient_sample` honesty gates; do not blend factual into visual movement.
- [v12.3]: Accepted visual gap `meanQualityScore 70.17 < 75`; **factual fidelity baseline must remain 1.0** in any new release gate.
- [v12.4]: `guardOutputLearningPrefill`, `filterApprovedPostgresLearnings`; `qualityImprovementPathRate=1.0` and `safetyGuardPassRate=1.0` must stay green.

### Claude's Discretion
- Exact module paths (`human-quality/improvement/` vs `calibration/apply.ts`), API routes, evidence JSON location under `.planning/phases/132-*`.
- Accept workflow: CLI-only vs owner API PATCH for `proposed` → `accepted` (recommend both, mirror Phase 130/131).
- `RUBRIC_CALIBRATION_VERSION` bump semver (recommend `1.1.0` for targeted visual tweaks).
- Which accepted proposals to implement when corpus has few rows (recommend: implement all `accepted` rows; if zero proposals, seed from calibration run + operator accept before code edits).
- Re-evaluation cohort label (`post_learning` vs new `post_quality_132` cohort).
- Plan wave count (3–4 plans): accept/apply core → module edits → regression guards → re-evaluation evidence.
- Supplemental corpus archetype fixtures for `weak_hierarchy`, `illegible_cta`, `unfocused_composition` (only 2/5 visual archetypes exist in `CORPUS_ARCHETYPE_FIXTURES` today).

### Deferred Ideas (OUT OF SCOPE)
- Milestone release gate orchestration (Phase 133 — QA-22–24).
- Owner dashboard trend lines (LIVEQUAL-02).
- Fine-tuning image models.
- Freeform prompt mutation from learnings.
- ML calibration / Platt scaling.
- Re-scoring historical corpus snapshots with new analyzers (breaks Phase 130 audit contract).
- Weakening factual hard-failure classifiers to improve visual scores.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUALITY-01 | Overload, weak hierarchy, generic template feel, illegible CTA and unfocused composition are first-class visible failure reasons | Already in `HUMAN_QUALITY_FAILURE_REASONS`, DB check constraint, UI labels, `failure-bridge.ts` gate targets; strengthen with optional archetype fixtures + rubric/gate marker coverage for all five |
| QUALITY-02 | Prompt/gate/rubric changes target only failure reasons proven by corpus evidence | Apply only `accepted` rows from `rubric_calibration_adjustments` with `evidenceRefs.corpusItemIds`; each code diff cites `adjustmentId` + slice stats; reject drive-by edits |
| QUALITY-03 | Visual quality changes preserve v12.3 hard factual protections and v12.4 learning safety guards | Re-run `check-creative-validation-evidence.mjs`, `check-output-learning-evidence.mjs`, `gate-failure-matrix.test.ts`, `guards.test.ts`; factual_issue proposals must not reduce `FIDELITY_HARD_FAILURE_CODES` detection |
| QUALITY-04 | Improved outputs can be re-evaluated against the same corpus dimensions to show whether the targeted failure decreased | `human-quality/improvement/` failure-frequency report (before/after human `primaryFailureReason` counts per slice) + deterministic gate fixture pass-rate delta; evidence CLI + checker |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Accept adjustment proposals (QUALITY-02) | API / Backend + Database | CLI script | Postgres `status` lifecycle; auditable accept timestamp/reviewer |
| Apply ceiling/rubric/gate edits (QUALITY-02) | API / Backend (server modules) | — | `creative-score-ceilings.ts`, `observable-rubric.ts`, `creative-quality-gate.ts` are server-side scoring artifacts |
| Regeneration/prompt directives for visual failures | API / Backend (`regeneration-correction-brief.ts`, `per-mode-prompt-rules.ts`) | — | Prompt injection happens server-side at generation/regenerate |
| Factual hard-failure preservation (QUALITY-03) | API / Backend (`creative-quality-gate.ts`, `creative-validation-aggregation.ts`) | CI scripts | Fidelity codes and aggregation thresholds are server + evidence gate |
| Output-learning safety guards (QUALITY-03) | API / Backend (`output-learning/safety/guards.ts`) | — | Prefill blocking is server-side; must not regress |
| Failure-frequency re-evaluation (QUALITY-04) | API / Backend (`human-quality/improvement/`) | CLI evidence | Pure aggregation over evaluated corpus rows; no client scoring |
| Human re-evaluation UI dimensions | Browser / Client (`HumanQualityCorpusPanel`) | — | Already exists from Phase 129; Phase 132 consumes new cohort items |
| Live image regeneration for after samples | API / Backend (derivation pipeline) | Operator manual | Re-evaluation needs new outputs — not automatic in code-only wave |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project pin | Apply service, re-evaluation report | Brownfield; Phases 129–131 pattern |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Unit tests for apply + re-evaluation | `app/config/vitest.config.ts`; calibration 45 tests green |
| Drizzle ORM | project pin | `rubric_calibration_adjustments` accept/supersede | Phase 130 registry |
| Zod | project pin | Accept API body validation | Phase 129 routes |
| `human-quality/calibration/failure-bridge.ts` | — | Human reason → module/key | QUALITY-02 targeting |
| `human-quality/calibration/adjustments.ts` | — | Proposal shape + evidence refs | Source of apply inputs |
| `creative-score-ceilings.ts` | — | `SCORE_CEILING_BY_FAILURE` | `targetModule: score_ceiling` |
| `observable-rubric.ts` | — | `VISUAL_OVERLOAD_RUBRIC`, markers | `targetModule: observable_rubric` |
| `creative-quality-gate.ts` | — | Note/score-issue promotion | `targetModule: gate_classifier` |
| `creative-quality-taxonomy.ts` | — | Shared regex patterns | Single source for gate markers |
| `regeneration-correction-brief.ts` | — | `FAILURE_CORRECTION_DIRECTIVES` | Prompt-side corrections for gate codes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | project pin | `run-quality-improvement.ts` CLI | Mirror `run-score-calibration.ts` |
| `check-creative-validation-evidence.mjs` | — | v12.3 factual + meanQuality regression | QUALITY-03 gate |
| `check-output-learning-evidence.mjs` | — | v12.4 safetyGuardPassRate | QUALITY-03 gate |
| `corpus-fixtures.ts` | — | Deterministic gate archetypes | QUALITY-04 fixture arm (visual_overload, generic_template_aesthetic exist) |
| `quality-rubric-regression.test.ts` | — | Rubric injection regression | After observable-rubric edits |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres accept lifecycle | Git-only changelog | Fails CALIB-03/QUALITY-02 audit chain |
| Auto-parse rationale for ceiling numbers | Operator-specified bounded delta in accept payload | Rationale is descriptive text, not machine-actionable |
| Re-score frozen corpus snapshots | New corpus items in post-change cohort | Re-score breaks Phase 130 comparison contract |
| Single combined quality pass metric | Separate visual/factual/learning buckets | Violates v12.5 locked decisions |
| Broad prompt rewrites | Targeted constant/marker edits per proposal | Violates QUALITY-02 evidence binding |

**Installation:** None — no new npm dependencies.

**Version verification:** `npm view vitest version` → 4.1.9 (2026-06-17); `app/package.json` pins `^4.1.5`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 130 persisted proposals (status=proposed)                                │
│  rubric_calibration_adjustments + evidenceRefs.corpusItemIds                 │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ improvement/accept.ts — acceptProposedAdjustments()                          │
│  Operator/CLI: proposed → accepted (reviewerUserId, acceptedAt)              │
│  Bump RUBRIC_CALIBRATION_VERSION; supersede prior accepted for same slice    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ improvement/apply.ts — buildApplyPlan(accepted[])                            │
│  Per row: targetModule + targetKey → bounded code change spec                │
│  QUALITY-02: skip if evidenceRefs.count < MIN_SLICE_SAMPLE or no corpus IDs  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│ score_ceiling     │ │ observable_rubric │ │ gate_classifier           │
│ SCORE_CEILING_*   │ │ VISUAL_OVERLOAD_* │ │ OVERLOAD_NOTE_MARKERS etc │
│ (ceilings.ts)     │ │ (observable-rubric)│ │ (gate + taxonomy)        │
└────────┬─────────┘ └────────┬─────────┘ └────────────┬─────────────┘
         │                    │                        │
         └────────────────────┼────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Optional: regeneration-correction-brief FAILURE_CORRECTION_DIRECTIVES        │
│  (gate-code keyed — extend only for accepted visual targets)                 │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ QUALITY-03 regression gate (CI / phase evidence)                             │
│  check-creative-validation-evidence + check-output-learning-evidence           │
│  gate-failure-matrix + guards.test.ts + quality-rubric-regression              │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ QUALITY-04 re-evaluation                                                     │
│  improvement/reevaluate.ts — failure reason frequency before/after           │
│  Human corpus: baseline/pre_learning vs post_* cohort evaluations              │
│  Fixture arm: gate detection rate on CORPUS_ARCHETYPE_FIXTURES (visual)        │
│  → 132-EVIDENCE.json + check-quality-improvement-evidence.mjs                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app/src/server/human-quality/
├── calibration/           # existing — read proposals, do not merge apply into service.ts
├── improvement/
│   ├── types.ts           # ApplyPlan, AcceptedAdjustment, ReevaluationReport
│   ├── accept.ts          # accept + supersede lifecycle
│   ├── apply.ts           # targetModule → change spec (no direct file I/O — planner maps to edits)
│   ├── reevaluate.ts      # QUALITY-04 failure-frequency before/after
│   └── service.ts         # runQualityImprovement() orchestrator
app/src/server/repositories/
├── rubric-calibration-adjustments.ts  # extend: acceptAdjustment, listAccepted, supersede
app/scripts/
├── run-quality-improvement.ts
├── check-quality-improvement-evidence.mjs
```

### Pattern 1: Evidence-Bound Accept + Apply (QUALITY-02)

**What:** Only `accepted` adjustments with non-empty `evidenceRefs.corpusItemIds` and `sliceStats.count ≥ 3` may drive code changes. Each git diff hunk references `adjustmentId`.

**When to use:** Every module edit in Phase 132.

**Example:**

```typescript
// Source: [VERIFIED: adjustments.ts ProposedAdjustment + schema rubric_calibration_adjustments]
export interface AcceptAdjustmentInput {
  adjustmentId: string;
  reviewerUserId: string;
  /** Bounded change intent — not parsed from freeform rationale */
  changeSpec?: {
    ceilingDelta?: number; // e.g. -5 when over-scoring visual_overload
    rubricTightening?: "minor" | "moderate";
    gateMarkerAdditions?: string[];
  };
}

export async function acceptAdjustment(
  input: AcceptAdjustmentInput
): Promise<RubricCalibrationAdjustment> {
  // 1. Load row; require status === 'proposed'
  // 2. Validate evidenceRefs.corpusItemIds.length >= MIN_SLICE_SAMPLE
  // 3. UPDATE status='accepted', acceptedAt, acceptedBy
  // 4. Supersede prior accepted for same slice_key+target_module+target_key
}
```

### Pattern 2: Human Failure → Module Target Map (QUALITY-01)

**What:** `failure-bridge.ts` is canonical; apply logic must not invent new mappings.

| Human `primaryFailureReason` | `targetModule` (typical) | `targetKey` | Prompt/gate surface |
|------------------------------|--------------------------|-------------|---------------------|
| `visual_overload` | `score_ceiling` | `visual_overload` | `VISUAL_OVERLOAD_RUBRIC`, `OVERLOAD_NOTE_MARKERS` |
| `weak_hierarchy` | `score_ceiling` | `missing_dominant_idea` | `MISSING_DOMINANT_IDEA_MARKERS` |
| `generic_template_feel` | `score_ceiling` | `generic_template_aesthetic` | `GENERIC_TEMPLATE_RUBRIC` |
| `illegible_cta` | `score_ceiling` | `unreadable_required_text` or `cta_drift` | `ILLEGIBILITY_PATTERN`, thumbnail rubric |
| `unfocused_composition` | `score_ceiling` | `missing_dominant_idea` / `decorative_only_variation` | `DECORATIVE_ONLY_PATTERN`, per-mode rules |
| `factual_issue` | `gate_classifier` | fidelity codes | **Do not weaken** — QUALITY-03 |

[VERIFIED: `failure-bridge.ts:16-25`, `resolveAdjustmentTarget` priority ceiling → rubric → gate]

### Pattern 3: Regression Guard Suite (QUALITY-03)

**What:** Before marking Phase 132 complete, run existing v12.3/v12.4 evidence checkers unchanged.

**Commands:**

```bash
# v12.3 factual + meanQuality infrastructure (factualFidelityRate must stay ≥ threshold)
node app/scripts/check-creative-validation-evidence.mjs --stage final

# v12.4 output-learning safety
node app/scripts/check-output-learning-evidence.mjs

# Targeted vitest subsets [VERIFIED: check-output-learning-evidence.mjs:15-28]
cd app && npm test -- tests/unit/ai/gate-failure-matrix.test.ts tests/unit/ai/creative-quality-gate.test.ts
cd app && npm test -- src/server/output-learning/safety/guards.test.ts
```

**Invariant:** No edit to `FIDELITY_HARD_FAILURE_CODES` set or factual classifier patterns. Visual-only files: ceilings, observable rubric, visual gate markers, visual correction directives.

### Pattern 4: Failure-Frequency Re-Evaluation (QUALITY-04)

**What:** Compare human `primaryFailureReason` distribution for targeted reasons before vs after improvements, using the **same evaluation dimensions** (visual score, factual pass, failure reason, intent).

**Arms:**

| Arm | Source | Role |
|-----|--------|------|
| Before | Evaluated corpus items with `cohort in ('baseline','pre_learning')` OR `selectedAt < improvementDeployedAt` | Historical failure frequency |
| After | New evaluated items with `cohort='post_learning'` or dedicated `post_quality_132` | Post-change human judgment |
| Fixture | `CORPUS_ARCHETYPE_FIXTURES` gate classification on raw QA outputs | Deterministic detection delta without re-scoring human snapshots |

**Report shape:**

```typescript
export interface QualityImprovementReport {
  schemaVersion: 1;
  rubricCalibrationVersion: string; // post-apply version e.g. "1.1.0"
  capturedAt: string;
  status: "ok" | "insufficient_sample";
  targetedFailureReasons: readonly HumanQualityFailureReason[];
  visualMetrics: {
    failureFrequencyBefore: Record<string, { count: number; rate: number | null }>;
    failureFrequencyAfter: Record<string, { count: number; rate: number | null }>;
    deltaRateByReason: Record<string, number | null>; // negative = improvement
  };
  factualMetrics: {
    factualPassRateBefore: number | null;
    factualPassRateAfter: number | null;
    // must not trade factual pass for visual improvement
  };
  fixtureMetrics?: {
    targetedArchetypePassRateBefore: number | null;
    targetedArchetypePassRateAfter: number | null;
  };
  acceptedAdjustments: Array<{ adjustmentId: string; targetModule: string; targetKey: string }>;
}
```

**Minimum samples:** Mirror Phase 130 — ≥3 per arm per targeted reason before claiming delta; else `insufficient_sample`.

### Anti-Patterns to Avoid

- **Drive-by rubric/gate edits without adjustment row:** Violates QUALITY-02.
- **Weakening factual classifiers to raise visual scores:** Violates QUALITY-03 and v12.3 baseline.
- **Re-scoring frozen `qualitySnapshot`:** Breaks Phase 130 audit; use new corpus items for after arm.
- **Blending factual pass into visual improvement headline:** Violates v12.5 metric separation.
- **Auto-accepting all proposals:** Operator accept step required for audit trail.
- **Editing `guardOutputLearningPrefill` for visual gains:** Out of scope; risks v12.4 regression.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Proposal → module mapping | Ad-hoc switch per PR | `failure-bridge.ts` + `resolveAdjustmentTarget` | Single taxonomy bridge |
| Accept/status lifecycle | Git markdown only | Postgres `rubric_calibration_adjustments` | CALIB-03 chain |
| Factual regression detection | New fidelity regex set | `FIDELITY_HARD_FAILURE_CODES` + `gate-failure-matrix.test.ts` | Single fidelity definition |
| Safety guard semantics | Duplicate guards | `output-learning/safety/guards.ts` + existing tests | v12.4 canonical |
| Failure frequency math | Stats package | Pure TS reducers (mirror `aggregate.ts`) | Small N |
| Evidence CI validation | Ad-hoc asserts | `check-quality-improvement-evidence.mjs` | Phase 130/131 pattern |
| Human failure enums | String literals | `HUMAN_QUALITY_FAILURE_REASONS` | Phase 129 contract |

**Key insight:** Phase 132 is a **surgical apply + prove** phase. Phase 130 measured divergence; Phase 132 makes bounded changes and proves targeted failures decreased — without breaking the factual and learning guardrails that v12.3/v12.4 already greenlit.

## Common Pitfalls

### Pitfall 1: Applying Proposals Without Accept Step

**What goes wrong:** Code edits land without `accepted` status or reviewer audit.

**Why it happens:** Pressure to fix `meanQualityScore 70.17 < 75` quickly.

**How to avoid:** `acceptAdjustment` required before `apply`; evidence JSON lists `acceptedAdjustments` with IDs.

**Warning signs:** `rubric_calibration_adjustments` rows still `proposed` after gate/rubric diffs merge.

### Pitfall 2: Factual Regression While Tightening Visual Gate

**What goes wrong:** Broader `creativeRisk` markers start matching factual notes; fidelity pass rate drops.

**Why it happens:** Shared `classifyQaNote` path for factual and visual notes [VERIFIED: `creative-quality-gate.ts:250-312`].

**How to avoid:** Run `gate-failure-matrix.test.ts` + `check-creative-validation-evidence.mjs` after every visual marker edit; keep factual patterns in `creative-quality-taxonomy.ts` unchanged.

**Warning signs:** `factualFidelityRate < 1.0` in creative validation evidence.

### Pitfall 3: Re-Evaluation Without After Samples

**What goes wrong:** QUALITY-04 claims improvement from calibration delta alone (auto vs human), not failure-frequency change.

**Why it happens:** No new corpus evaluations after deploy.

**How to avoid:** Document operator step: enqueue post-change derivations → human evaluate → run `run-quality-improvement.ts`; checker rejects improvement claims when `afterCount === 0`.

**Warning signs:** `failureFrequencyAfter` empty in evidence JSON.

### Pitfall 4: Corpus Fixture Gap for 3/5 Visual Reasons

**What goes wrong:** Deterministic re-evaluation only covers `visual_overload` and `generic_template_aesthetic`.

**Why it happens:** `CORPUS_ARCHETYPE_FIXTURES` has no archetypes for `weak_hierarchy`, `illegible_cta`, `unfocused_composition` [VERIFIED: `corpus-fixtures.ts:120-224`].

**How to avoid:** Add 3 archetype fixtures in Wave 0 or 132-04; map to human failure reasons via `failure-bridge.ts`.

**Warning signs:** `fixtureMetrics` only reports 2 of 5 targeted reasons.

### Pitfall 5: Learning Safety Guard Regression

**What goes wrong:** Prompt/rubric edits leak into output-learning prefill paths.

**Why it happens:** Shared prompt builder surfaces.

**How to avoid:** Run `check-output-learning-evidence.mjs` and `guards.test.ts`; do not modify `output-learning/safety/guards.ts` except bugfixes.

**Warning signs:** `safetyGuardPassRate < 1.0` in output-learning evidence.

### Pitfall 6: Over-Scoring Fix Becomes Under-Scoring

**What goes wrong:** Lowering ceilings too aggressively flags formerly acceptable outputs.

**Why it happens:** Phase 130 proposals cite over-score bias; excessive ceiling cuts hurt pass rate.

**How to avoid:** Bounded `ceilingDelta` (e.g. max -5 per accept); re-run calibration after apply to verify MAE improved without factual harm.

**Warning signs:** `underScoreCount` spikes in post-apply calibration report.

## Code Examples

### List accepted adjustments for apply plan

```typescript
// Source: [VERIFIED: rubric-calibration-adjustments.ts pattern + Phase 132 extension]
import { listAcceptedAdjustments } from "@/server/repositories/rubric-calibration-adjustments";
import { resolveAdjustmentTarget } from "@/server/human-quality/calibration/failure-bridge";

export async function buildApplyPlan(adjustmentVersion: string) {
  const accepted = await listAcceptedAdjustments({ adjustmentVersion, status: "accepted" });
  return accepted
    .filter((row) => row.evidenceRefs.corpusItemIds.length >= 3)
    .map((row) => {
      const [, failureReason] = row.sliceKey.split("|");
      return {
        adjustmentId: row.id,
        targetModule: row.targetModule,
        targetKey: row.targetKey,
        sliceKey: row.sliceKey,
        evidenceCount: row.evidenceRefs.corpusItemIds.length,
        gateTargets: resolveAdjustmentTarget(failureReason as HumanQualityFailureReason),
      };
    });
}
```

### Failure-frequency comparison (QUALITY-04)

```typescript
// Source: [VERIFIED: calibration/aggregate.ts groupComparisonsBy pattern]
const TARGETED_VISUAL_FAILURES = [
  "visual_overload",
  "weak_hierarchy",
  "generic_template_feel",
  "illegible_cta",
  "unfocused_composition",
] as const;

export function failureRatesByReason(
  comparisons: CalibrationComparison[]
): Record<string, { count: number; rate: number | null }> {
  const total = comparisons.length;
  const grouped = groupComparisonsBy(comparisons, "primaryFailureReason");
  const out: Record<string, { count: number; rate: number | null }> = {};
  for (const reason of TARGETED_VISUAL_FAILURES) {
    const count = grouped[reason]?.count ?? 0;
    out[reason] = { count, rate: total > 0 ? count / total : null };
  }
  return out;
}
```

### Bounded ceiling apply (score_ceiling target)

```typescript
// Source: [VERIFIED: creative-score-ceilings.ts SCORE_CEILING_BY_FAILURE]
import { SCORE_CEILING_BY_FAILURE } from "@/server/ai/creative-score-ceilings";

export function computeBoundedCeiling(
  targetKey: CreativeHardFailureCode,
  ceilingDelta: number,
  maxDelta = 5
): number {
  const current = SCORE_CEILING_BY_FAILURE[targetKey] ?? 60;
  const boundedDelta = Math.max(-maxDelta, Math.min(maxDelta, ceilingDelta));
  return Math.max(0, Math.min(100, current + boundedDelta));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Anecdotal prompt tweaks | Corpus-evidence proposals (Phase 130) | v12.5 Phase 130 | Phase 132 applies with audit chain |
| Prompt-only visual caps | Server `applyScoreCeilings` | Phase 121 | Ceilings are code constants — calibration tunes via proposals |
| Fixture-only quality claims | Human corpus + calibration | Phases 129–130 | Phase 132 must prove failure decrease on human dimensions |
| No accept/apply API | `proposed` only in Postgres | Phase 130 complete | Phase 132 adds `accepted` + code apply |
| 2/5 visual corpus archetypes | Need 5 for full fixture re-eval | Gap today | Wave 0 or 132-04 fixture additions |

**Deprecated/outdated:**
- Changing `observable-rubric.ts` without a linked `rubric_calibration_adjustments` row — Phase 130/132 boundary [VERIFIED: `130-03-SUMMARY.md:95`].
- Using `meanQualityScore 70.17` fixture aggregate alone as Phase 132 success — QUALITY-04 requires targeted failure decrease.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Operator will accept specific proposals before code apply | Pattern 1 | If auto-apply expected, accept workflow adds friction |
| A2 | Post-change human evaluations use `post_learning` or new cohort label | Pattern 4 | Wrong cohort filter skews before/after comparison |
| A3 | Bounded ceiling delta ±5 is sufficient for first apply pass | Code Examples | May need operator tuning per slice |
| A4 | Three missing corpus archetypes can be added without new render captures | Pitfall 4 | May need synthetic QA outputs only (no PNG) |
| A5 | `RUBRIC_CALIBRATION_VERSION` bump to `1.1.0` signals apply tranche | Pattern 1 | Version semantics need Phase 133 gate alignment |

## Open Questions (RESOLVED)

1. **Zero accepted proposals at plan time**
   - What we know: Proposals are auto-generated when calibration runs; `persistedAdjustmentCount` may be 0 on fresh DB [VERIFIED: `130-EVIDENCE.template.json:14`].
   - What's unclear: Whether production corpus already has proposals.
   - Recommendation: Plan 132-01 includes `run-score-calibration.ts` + operator accept step before module edits; block apply wave if zero accepted rows.

2. **After-arm corpus size**
   - What we know: Phase 129 corpus is operator-driven and may be small.
   - What's unclear: How many post-change evaluations will exist before Phase 133.
   - Recommendation: QUALITY-04 checker allows `insufficient_sample` honestly; Phase 133 QA-24 can accept smaller gap with caveat.

3. **Human failure → regeneration prompt bridge**
   - What we know: `FAILURE_CORRECTION_DIRECTIVES` keyed by gate codes, not human reasons.
   - What's unclear: Whether Phase 132 should add `HUMAN_FAILURE_CORRECTION_DIRECTIVES` for the five visual reasons.
   - Recommendation: Optional thin map in `regeneration-correction-brief.ts` delegating to gate directives via `failure-bridge.ts` — only for accepted slices.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Scripts, vitest | ✓ | v25.9.0 [VERIFIED: shell] | — |
| npm / vitest | Unit tests | ✓ | vitest 4.1.9 | — |
| PostgreSQL | Accept adjustments, re-eval join | ✗ (local dev) | — | Mock repository in unit tests; CI `DATABASE_URL` |
| Evaluated human corpus | QUALITY-04 after arm | ✓ at dev runtime (Phase 129) | — | `insufficient_sample` in evidence |
| Operator regeneration | After-arm samples | Manual | — | Fixture-only arm for deterministic partial proof |

**Missing dependencies with no fallback:**
- Live evaluated post-change corpus items for full QUALITY-04 human arm — operator workflow required.

**Missing dependencies with fallback:**
- Local Postgres — unit tests with mocked repository (Phase 129/130 pattern).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/human-quality/improvement` |
| Full suite command | `cd app && npm test && npm run lint && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUALITY-01 | Five failure reasons in taxonomy + bridge targets | unit | `cd app && npm test -- tests/unit/human-quality/calibration/failure-bridge.test.ts -x` | ✅ |
| QUALITY-01 | Optional archetype fixtures for 3 missing visual reasons | unit | `cd app && npm test -- tests/unit/ai/corpus-fixtures.test.ts -x` | ❌ Wave 0 (fixtures) |
| QUALITY-02 | Accept rejects proposed without evidence | unit | `cd app && npm test -- tests/unit/human-quality/improvement/accept.test.ts -x` | ❌ Wave 0 |
| QUALITY-02 | Apply plan only includes accepted rows | unit | `cd app && npm test -- tests/unit/human-quality/improvement/apply.test.ts -x` | ❌ Wave 0 |
| QUALITY-03 | Factual hard failures unchanged | unit | `cd app && npm test -- tests/unit/ai/gate-failure-matrix.test.ts -x` | ✅ |
| QUALITY-03 | v12.4 safety guards pass | unit | `cd app && npm test -- src/server/output-learning/safety/guards.test.ts -x` | ✅ |
| QUALITY-03 | Creative validation evidence final stage | integration | `node app/scripts/check-creative-validation-evidence.mjs --stage final` | ✅ |
| QUALITY-03 | Output learning evidence | integration | `node app/scripts/check-output-learning-evidence.mjs` | ✅ |
| QUALITY-04 | Failure frequency before/after | unit | `cd app && npm test -- tests/unit/human-quality/improvement/reevaluate.test.ts -x` | ❌ Wave 0 |
| QUALITY-04 | Evidence checker rejects false improvement | script | `node app/scripts/check-quality-improvement-evidence.mjs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/human-quality/improvement`
- **Per wave merge:** `cd app && npm test -- tests/unit/human-quality tests/unit/ai/gate-failure-matrix.test.ts src/server/output-learning/safety/guards.test.ts`
- **Phase gate:** Full suite + `check-creative-validation-evidence.mjs --stage final` + `check-output-learning-evidence.mjs` + `check-quality-improvement-evidence.mjs`

### Wave 0 Gaps

- [ ] `app/src/server/human-quality/improvement/` module (accept, apply, reevaluate, service)
- [ ] `acceptAdjustment` / `listAcceptedAdjustments` in `rubric-calibration-adjustments.ts`
- [ ] `tests/unit/human-quality/improvement/*.test.ts`
- [ ] `app/scripts/run-quality-improvement.ts` + `check-quality-improvement-evidence.mjs`
- [ ] `132-EVIDENCE.template.json` — schema contract
- [ ] Optional: 3 `CORPUS_ARCHETYPE_FIXTURES` for weak_hierarchy, illegible_cta, unfocused_composition
- [ ] Schema migration: `accepted_at`, `accepted_by` columns on `rubric_calibration_adjustments` (if not jsonb-metadata)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Platform-owner auth on accept/apply API (mirror `requireCalibrationAccess`) |
| V3 Session Management | no | Uses existing session |
| V4 Access Control | yes | Only owner/admin may accept adjustments affecting global rubric |
| V5 Input Validation | yes | Zod on accept payload; bounded `changeSpec`; no prompt injection via evidence JSON |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized rubric weakening | Tampering | Accept API owner-only; audit `reviewerUserId` |
| Prompt leakage via evidence | Information disclosure | `evidenceRefs` cites corpus IDs only — no prompts [VERIFIED: Phase 129 `FORBIDDEN_PAYLOAD_KEYS`] |
| Factual guard bypass via visual edits | Elevation of privilege | Regression suite blocks fidelity regression |
| Unbounded accept payload | DoS | Cap `gateMarkerAdditions` array length; validate `ceilingDelta` range |

## Primary Recommendation for Plan Waves

| Wave | Plan focus | Requirements | Depends on |
|------|------------|--------------|------------|
| **132-01** | Accept lifecycle + repository extensions + `RUBRIC_CALIBRATION_VERSION` bump | QUALITY-02 (partial) | Phase 130 proposals table |
| **132-02** | Evidence-bound module edits (ceilings, rubric, gate markers, optional correction directives) | QUALITY-01, QUALITY-02 | 132-01 accepted rows |
| **132-03** | Regression guard wiring + phase evidence for v12.3/v12.4 | QUALITY-03 | 132-02 |
| **132-04** | Re-evaluation report, fixture gaps, CLI + checker + optional owner UI tab | QUALITY-04 | 132-02; operator after-corpus |

**Planner sequencing rule:** 132-02 must not start until at least one adjustment is `accepted` with valid evidence refs. 132-04 human arm may complete asynchronously via operator — checker must support `insufficient_sample`.

## Project Constraints (from .cursor/rules/)

- Use Context7 MCP for library documentation when implementing framework-specific APIs [VERIFIED: workspace `context7.mdc`].
- Render ephemeral filesystem — improvement evidence in `.planning/phases/132-*` and Postgres, not production local-only state [VERIFIED: `render-platform.mdc`].
- No project-local `.cursor/rules/` directory in repo [VERIFIED: glob 2026-06-17].

## Sources

### Primary (HIGH confidence)
- `app/src/server/human-quality/calibration/failure-bridge.ts` — human reason → gate/rubric/ceiling targets
- `app/src/server/human-quality/calibration/adjustments.ts` — proposal builder + evidence refs
- `app/src/server/repositories/rubric-calibration-adjustments.ts` — current CRUD surface
- `app/src/server/human-quality/corpus.ts` — failure reason enums
- `app/src/server/ai/creative-score-ceilings.ts`, `observable-rubric.ts`, `creative-quality-gate.ts`
- `app/src/server/ai/corpus-fixtures.ts` — deterministic archetype coverage gap
- `app/scripts/check-creative-validation-evidence.mjs`, `check-output-learning-evidence.mjs`
- `.planning/phases/130-score-calibration-and-rubric-alignment/130-RESEARCH.md`, `130-03-SUMMARY.md`
- `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`
- npm registry — vitest 4.1.9

### Secondary (MEDIUM confidence)
- `.planning/phases/131-learning-impact-measurement/131-RESEARCH.md` — metric separation and evidence CLI patterns

### Tertiary (LOW confidence)
- None stated as fact without codebase verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield modules verified; calibration tests 45/45 green
- Architecture: HIGH — Phase 130 → 132 boundary explicit in summaries and code
- Pitfalls: MEDIUM — after-corpus size and proposal count depend on operator runtime

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (30 days — stable brownfield extension)

## RESEARCH COMPLETE

**Phase:** 132 - Targeted Creative Quality Improvements
**Confidence:** HIGH

### Key Findings
- Phase 132 applies Phase 130 `proposed` adjustments — accept/apply pipeline does not exist yet; only insert/list/find in repository.
- Five visual failure reasons are already first-class in schema/UI/bridge; gap is detection alignment (gate/rubric/ceilings) and 3/5 corpus archetype fixtures.
- QUALITY-03 regression path is established: `check-creative-validation-evidence.mjs` + `check-output-learning-evidence.mjs` + existing vitest matrices.
- QUALITY-04 requires before/after failure-reason frequency on human corpus (new post-change evaluations), not re-scoring frozen snapshots.
- Recommended 4-plan wave: accept → evidence-bound edits → regression guards → re-evaluation evidence.

### File Created
`.planning/phases/132-targeted-creative-quality-improvements/132-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Verified modules; no new deps |
| Architecture | HIGH | Clear 130→132 apply boundary in code and summaries |
| Pitfalls | MEDIUM | Operator corpus size and proposal availability |

### Open Questions (RESOLVED)

- **Whether production DB already has non-zero proposed adjustments at plan time.** RESOLVED: Plan 132-02 checkpoint 02-00 requires operator to run `run-score-calibration.ts` and accept ≥1 visual proposal before module edits; if zero proposals exist, operator must generate proposals first (no auto-accept).
- **Whether to add `post_quality_132` cohort vs reuse `post_learning`.** RESOLVED: Reuse `post_learning` cohort for after-arm human re-evaluation; Plan 132-04 re-evaluation report compares before (baseline/pre_learning) vs after (`post_learning`) failure-frequency slices. Dedicated `post_quality_132` cohort deferred — not needed for QUALITY-04 honesty gates.
- **Optional human-failure → regeneration directive map.** RESOLVED: Plan 132-02-02 optionally adds `HUMAN_FAILURE_CORRECTION_DIRECTIVES` in `regeneration-correction-brief.ts` delegating to gate codes via `resolveGateTargets` — only for accepted visual slices; not mandatory for phase completion.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
