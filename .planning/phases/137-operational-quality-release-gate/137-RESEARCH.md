# Phase 137: Operational Quality Release Gate - Research

**Researched:** 2026-06-18
**Domain:** v12.6 milestone closure — live operational evidence gate composed from Phase 133 technical regression + Phases 134–136 live corpus/sampling/trends
**Confidence:** HIGH

## Summary

Phase 137 is the **v12.6 milestone closure** phase. Phases 129–133 shipped the human-quality infrastructure and a fixture-honest v12.5 release gate (`run-real-quality-release-gate.mjs`, `check-real-quality-release-evidence.mjs`) [VERIFIED: `app/package.json:37-38`, `app/scripts/run-real-quality-release-gate.mjs`]. Phases 134–136 added live corpus operations, canonical sampling sufficiency (`human-quality/sampling/`), and quality trend reporting (`human-quality/trend/`, `run-quality-trend.ts`, `run-sample-coverage.ts`) [VERIFIED: `app/src/server/human-quality/sampling/service.ts`, `app/scripts/run-quality-trend.ts`].

What does not exist yet is a **v12.6 operational gate** that:
1. Re-runs live evidence CLIs (calibration, impact, quality improvement, sample coverage, trend) against Postgres and aggregates into `137-EVIDENCE.json` (QALIVE-01).
2. Reports **technical regression** (`technical_regression` evidence source) separately from **operational live evidence** (`live_human` gates) so CI green on vitest does not imply operational quality is proven (QALIVE-02).
3. Blocks **quality-improvement claims** when live human sample is insufficient or factual pass ≠ 1.0 — stricter than v12.5 QA-24 `accepted_gap` which allowed milestone closure without live corpus (QALIVE-03).
4. Produces `v12.6-MILESTONE-AUDIT.md` with exact commands, live sample counts, accepted caveats, and `nextOperatorAction` from coverage (QALIVE-04).

The brownfield pattern is Phase 133's four-plan wave: evidence schema + checker → orchestrator → live aggregation + `--run-regression` → milestone audit [VERIFIED: `.planning/phases/133-real-quality-release-gate/133-01-PLAN.md` through `133-04-PLAN.md`]. Phase 137 should **extend** Phase 133 — not replace it. Technical steps reuse `real-quality-release-gate` vitest matrix and `runRegressionMode()` [VERIFIED: `check-real-quality-release-evidence.mjs:725-779`]; operational steps compose Phase 135 `technicalRegression` gate separation already modeled in `135-EVIDENCE.template.json` [VERIFIED: `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json:60-66`].

**Primary recommendation:** Ship 4 plans: (1) `137-EVIDENCE` schema + `check-operational-quality-release-evidence.mjs` with dual-status QALIVE-02/03 rules; (2) `run-operational-quality-release-gate.mjs` orchestrator wrapping technical + operational steps; (3) live evidence aggregation from 130–136 CLIs + npm script registration; (4) `v12.6-MILESTONE-AUDIT.md` + project state closure.

<user_constraints>
## User Constraints (from STATE.md — no Phase 137 CONTEXT.md)

### Locked Decisions
- [v12.6]: Turn the v12.5 quality infrastructure into a live operating loop; populate and evaluate real corpus rows before claiming quality movement.
- [v12.6]: Separate operational evidence from technical green checks; small datasets must yield `insufficient_sample`, not optimistic claims.
- [v12.6]: Surface live quality, factuality and learning-impact trends for owner decisions.
- [v12.5]: Validate output quality with a real human-judged corpus, not only deterministic fixtures; keep factual metrics separate from visual quality and learning-impact metrics.
- [v12.5]: Treat fixture-based v12.4 evidence as necessary but not sufficient for quality claims.
- [Phase 133]: QA-24 primary metric is `meanHumanVisualScore`; fixture 70.17 is reference baseline only; factual fidelity must remain 1.0; `--run-regression` for full v12.3/v12.4 script regression.
- [Phase 134]: MAX_CORPUS_BATCH_SIZE=25; batch POST 200 with per-item results; queue panel fetches `includeProgress=true`; do not mark SAMPLE/TREND/QALIVE complete in Phase 134.
- [Phase 135]: Canonical sampling in `human-quality/sampling/thresholds.ts`; `sampleGuidance` on insufficient reports; `evidenceSource` tags (`live_human`, `fixture`, `technical_regression`); shared `evidence-honesty.mjs`; Coverage tab for cross-gate slice gaps.
- [Phase 136]: ISO-week trend bucketing; regression compares last two populated weeks; `trend_global` uses real `runQualityTrend` status; Trend tab is sixth 403 gate; `TREND_MAX_ROWS=500`.
- [v12.3]: Accepted visual-quality gap `meanQualityScore 70.17 < 75`; factual fidelity baseline must remain 1.0 in any release gate.

### Claude's Discretion
- Exact filenames (`run-operational-quality-release-gate.mjs` vs extending `run-real-quality-release-gate.mjs` with `--milestone v12.6`).
- Whether operational orchestrator shells to `npm run real-quality-release-gate` for technical block vs inlines shared step constants.
- Milestone closure status when technical passes but operational gates are `insufficient_sample` (`tech_debt` vs `gaps_found` — recommend `tech_debt` mirroring v12.5 audit).
- Whether QALIVE-03 blocks milestone **closure** or only blocks **improvement claims** (recommend: block claims only; closure allowed with honest caveats — aligns with REQUIREMENTS "cannot claim").
- Plan wave count (3 vs 4) and whether npm scripts for `run-sample-coverage.ts` / `run-quality-trend.ts` register in 137-02 or 137-03.
- Embedding 135/136 evidence summaries vs `sourcePaths` only in 137 aggregate.

### Deferred Ideas (OUT OF SCOPE)
- Performance blending (PERFOUT-01..02).
- External reviewer marketplace / multi-reviewer agreement (REVIEWOPS-01..02).
- Commercial quality claims without live sample sufficiency.
- Fine-tuning image generation models.
- Weakening factual hard-failure classifiers to improve visual scores.
- Re-running live OpenAI capture regeneration in CI.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QALIVE-01 | Release gate reruns score calibration, learning impact, quality improvement and real-quality aggregate against live evidence | Operator pre-step: `run-score-calibration.ts`, `run-learning-impact.ts`, `run-quality-improvement.ts`, `run-sample-coverage.ts`, `run-quality-trend.ts` with `DATABASE_URL`; orchestrator runs sub-checkers + `check-operational-quality-release-evidence.mjs --aggregate`; extends Phase 133 `aggregateEvidence()` pattern with 135/136 `sourcePaths` |
| QALIVE-02 | Gate passes technical regression independently from operational-evidence status | Dual top-level sections `technicalRegression` (vitest + `--run-regression` + `technical_regression` tag) and `operationalEvidence` (live_human gates from 135 template); orchestrator exit 1 only on technical failure; operational `insufficient_sample` recorded without failing technical steps |
| QALIVE-03 | Milestone cannot claim quality improvement unless live human metrics meet sample sufficiency and factual pass remains 1.0 | `assertQalive03()` using `rejectClaimsWhenGuidanceBlocked` from `evidence-honesty.mjs`; require `qualityImprovement.status === "ok"` before `qualityImprovementClaimed: true`; hard gate `humanCorpusFactualPassRate === 1.0`; withhold movement deltas when `sampleGuidance.additionalNeeded > 0` |
| QALIVE-04 | Release audit records exact commands, live sample counts, accepted caveats and next operator action | `v12.6-MILESTONE-AUDIT.md` mirroring `v12.5-MILESTONE-AUDIT.md`; cite `evaluatedItemCount`, per-gate sample counts, `acceptedCaveats[]`, `sampleCoverage.nextOperatorAction` from `buildSampleCoverageReport()` [VERIFIED: `coverage.ts:81-107`] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live evidence generation (QALIVE-01) | CI scripts + Postgres (`tsx` CLIs) | — | Operator runs against `DATABASE_URL`; CI validates committed JSON |
| Technical regression block (QALIVE-02) | CI scripts (`app/scripts/`) | Phase 133 gate reuse | Vitest + `--factual-only` creative validation; no server runtime |
| Operational evidence validation (QALIVE-02/03) | CI evidence checker | Sampling/trend report engines | Honesty enforced at artifact boundary |
| Sample sufficiency gates (QALIVE-03) | API / Backend (`sampling/`) | CLI checkers | Single source: `thresholds.ts`, `guidance.ts`, `coverage.ts` |
| Trend snapshot for gate (QALIVE-01) | API / Backend (`trend/`) | `run-quality-trend.ts` | Phase 136 engine; gate consumes JSON |
| Quality-improvement claim policy (QALIVE-03) | CI evidence checker | — | Claims are documentary fields, not UI |
| Milestone audit narrative (QALIVE-04) | `.planning/milestones/` docs | Phase verification markdown | Human-readable closure separate from machine evidence |
| Operator next action (QALIVE-04) | API / Backend (`coverage.ts`) | Audit prose | `nextOperatorAction` already computed server-side |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM scripts | v25.9.0 [VERIFIED: shell] | Orchestrator + checkers | Brownfield; Phases 123/128/133 pattern |
| Vitest | 4.1.9 registry / ^4.1.5 pin [VERIFIED: npm registry, `app/package.json`] | Technical regression subsets + unit tests | `npm test` unchanged |
| `tsx` | project pin | Live evidence CLIs | `run-score-calibration.ts`, `run-learning-impact.ts`, `run-quality-improvement.ts`, `run-sample-coverage.ts`, `run-quality-trend.ts` |
| `check-real-quality-release-evidence.mjs` | — | Technical aggregation + `runRegressionMode()` | Reuse exports; do not duplicate QA-24 logic for v12.5 path |
| `check-sampling-sufficiency-evidence.mjs` | — | SAMPLE gate shape + `technicalRegression` gate key | Phase 135 checker [VERIFIED: `GATE_KEYS` line 24] |
| `check-quality-trend-evidence.mjs` | — | TREND honesty validation | Phase 136 checker |
| `lib/evidence-honesty.mjs` | — | `EVIDENCE_SOURCE`, `rejectClaimsWhenGuidanceBlocked` | Phase 135 shared module |
| Drizzle + Postgres | project pin | Live evidence generation | Operator pre-gate only |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `execFileSync` (node:child_process) | built-in | Shell vitest + node checkers | All orchestrators |
| `human-quality/sampling/service.ts` | — | `runSampleCoverage()` parallel rollup | 137 aggregation |
| Node `fs` + JSON | — | `.planning/phases/137-*` evidence | Milestone artifacts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New operational orchestrator | Extend `run-real-quality-release-gate.mjs` only | v12.5 gate hardcodes `milestoneVersion: "v12.5"` and phase 133 paths — mixing milestones confuses audit trail |
| Single blended pass field | Dual `technicalRegression` + `operationalEvidence` | Violates v12.6 locked decision and QALIVE-02 |
| Require live corpus for milestone closure | Block closure when `evaluatedItemCount < 5` | v12.5 shipped with `tech_debt` and empty corpus; v12.6 should close honestly with caveats, not block infra ship |
| New sampling library | Reuse `sampling/thresholds.ts` | Already canonical since Phase 135 |
| Hand-roll trend aggregation in gate | `runQualityTrend` + existing checker | Phase 136 complete |

**Installation:** None — no new npm dependencies.

**Version verification:**
```bash
npm view vitest version  # → 4.1.9 [VERIFIED: 2026-06-18]
node --version            # → v25.9.0 [VERIFIED: 2026-06-18]
```

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 134: Operator evaluates live corpus rows (Postgres)                    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Phase 130/131/132│  │ Phase 135        │  │ Phase 136        │
│ calibration /    │  │ sampling/        │  │ trend/           │
│ impact / quality │  │ coverage +       │  │ ISO-week series  │
│ tsx CLIs         │  │ guidance         │  │ run-quality-trend│
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Operator (DATABASE_URL): refresh 130/131/132/135/136-EVIDENCE.json           │
│  npx tsx scripts/run-score-calibration.ts --all-workspaces                   │
│  npx tsx scripts/run-learning-impact.ts --all-workspaces                     │
│  npx tsx scripts/run-quality-improvement.ts --all-workspaces                 │
│  npx tsx scripts/run-sample-coverage.ts --all-workspaces                     │
│  npx tsx scripts/run-quality-trend.ts --all-workspaces                       │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ run-operational-quality-release-gate.mjs (QALIVE-01)                         │
│  BLOCK A — Technical (QALIVE-02, independent pass/fail):                   │
│    Phase 133 vitest matrix + sub-checkers + --run-regression                 │
│    → technicalRegression.status = pass | fail                                │
│  BLOCK B — Operational (live evidence, does not fail Block A):               │
│    check-sampling-sufficiency-evidence + check-quality-trend-evidence          │
│    check-operational-quality-release-evidence --aggregate                    │
│    → operationalEvidence.status = ok | insufficient_sample | gaps_found      │
│  BLOCK C — Standard CI: npm test → lint → build                              │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│ technicalRegression           │    │ operationalEvidence                   │
│ evidenceSource: technical_     │    │ gates: calibration, impact, quality,  │
│   regression                  │    │   trend + sampleCoverage rollup       │
│ v12_3 factual 1.0, guards 1.0│    │ live_human tags + sampleGuidance      │
└──────────────────────────────┘    └──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 137-EVIDENCE.json + assertQalive03 (no improvement claim if insufficient)    │
│ acceptedCaveats[] + sampleCoverage.nextOperatorAction                      │
│ → 137-VERIFICATION.md + v12.6-MILESTONE-AUDIT.md (QALIVE-04)                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app/scripts/
├── run-operational-quality-release-gate.mjs      # NEW — QALIVE-01 orchestrator
├── check-operational-quality-release-evidence.mjs # NEW — QALIVE-02/03 validator
├── run-real-quality-release-gate.mjs             # existing — technical block reuse
├── check-real-quality-release-evidence.mjs       # existing — runRegressionMode export
├── check-sampling-sufficiency-evidence.mjs         # existing Phase 135
├── check-quality-trend-evidence.mjs              # existing Phase 136
├── run-sample-coverage.ts                        # existing Phase 135
├── run-quality-trend.ts                          # existing Phase 136
└── lib/evidence-honesty.mjs                        # shared honesty validators

.planning/phases/137-operational-quality-release-gate/
├── 137-EVIDENCE.template.json
├── 137-EVIDENCE.json                             # committed after operator run
├── 137-BASELINE.md
├── 137-VERIFICATION.md
└── 137-RESEARCH.md

.planning/milestones/
└── v12.6-MILESTONE-AUDIT.md                      # NEW — closure artifact
```

### Pattern 1: Dual-Status Evidence (QALIVE-02)

**What:** Top-level `technicalRegression` and `operationalEvidence` sections with separate `status`, `evidenceSource`, and `requirements` rows — no blended root pass field.

**When to use:** All 137 evidence validation and audit tables.

**Example:**

```javascript
// Source: [VERIFIED: 135-EVIDENCE.template.json gates.technicalRegression + evidence-honesty.mjs]
{
  "milestoneVersion": "v12.6",
  "technicalRegression": {
    "status": "pass",
    "evidenceSource": "technical_regression",
    "denominatorNote": "Deterministic v12.3/v12.4 regression scripts — not human corpus",
    "gateMatrixPass": true,
    "v12_3FactualFidelityRate": 1.0,
    "safetyGuardPassRate": 1.0,
    "sourcePath": ".planning/phases/133-real-quality-release-gate/133-EVIDENCE.json"
  },
  "operationalEvidence": {
    "status": "insufficient_sample",
    "evidenceSource": "live_human",
    "evaluatedItemCount": 3,
    "gates": {
      "calibration": { "status": "insufficient_corpus", "sampleGuidance": [/*...*/] },
      "impact": { "status": "insufficient_sample", "sampleGuidance": [/*...*/] },
      "qualityImprovement": { "status": "insufficient_sample", "sampleGuidance": [/*...*/] },
      "trend": { "status": "insufficient_sample", "sampleGuidance": [/*...*/] }
    },
    "sampleCoverage": {
      "nextGate": "calibration",
      "nextOperatorAction": "Need 2 more evaluations for quality trend direction (3/5).",
      "sourcePath": ".planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.json"
    }
  }
}
```

**Orchestrator exit policy:**

| technicalRegression | operationalEvidence | Process exit | milestone `status` |
|--------------------|---------------------|--------------|-------------------|
| pass | ok | 0 | `ok` |
| pass | insufficient_sample | 0 | `tech_debt` or `gaps_found` |
| fail | any | 1 | `blocked` |
| pass | gaps_found (stale/regression flags) | 0 | `gaps_found` |

### Pattern 2: Live Evidence Aggregation (QALIVE-01)

**What:** Extend Phase 133 `aggregateEvidence()` to pull live paths from 130–136 committed JSON, embed summaries + `sourcePaths`, and wire trend + coverage gates.

**When to use:** `check-operational-quality-release-evidence.mjs --aggregate` after operator refresh.

**Example:**

```javascript
// Source: [VERIFIED: check-real-quality-release-evidence.mjs:200-296]
import { aggregateEvidence as aggregateV125 } from "./check-real-quality-release-evidence.mjs";

export const PHASE_EVIDENCE_V126 = {
  ...PHASE_EVIDENCE, // 130, 131, 132, 123 from Phase 133
  sampling: ".planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.json",
  samplingFallback: ".planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json",
  trend: ".planning/phases/136-quality-trend-dashboard/136-EVIDENCE.json",
  trendFallback: ".planning/phases/136-quality-trend-dashboard/136-EVIDENCE.template.json",
};

export function aggregateOperationalEvidence(existing = {}) {
  const v125Core = aggregateV125(existing);
  const sampling = readPhaseEvidence(PHASE_EVIDENCE_V126.sampling, {
    fallbackPath: PHASE_EVIDENCE_V126.samplingFallback,
  });
  const trend = readPhaseEvidence(PHASE_EVIDENCE_V126.trend, {
    fallbackPath: PHASE_EVIDENCE_V126.trendFallback,
  });

  return {
    ...v125Core,
    milestoneVersion: "v12.6",
    operationalEvidence: buildOperationalSection({ sampling, trend, v125Core }),
    technicalRegression: buildTechnicalSection(existing, v125Core),
    trendMetrics: {
      evidenceSource: "live_human",
      status: trend.report?.status ?? trend.status,
      populatedBucketCount: trend.report?.populatedBucketCount ?? 0,
      alertFlags: trend.alertFlags ?? trend.report?.alertFlags,
      sourcePath: PHASE_EVIDENCE_V126.trend,
    },
    requirements: buildQaliveRequirements(),
  };
}
```

### Pattern 3: Quality-Improvement Claim Gate (QALIVE-03)

**What:** Reuse Phase 135 honesty helpers to forbid improvement claims when sample guidance blocks or factual rate ≠ 1.0.

**When to use:** Final validation in operational checker; audit prose must mirror JSON flags.

**Example:**

```javascript
// Source: [VERIFIED: app/scripts/lib/evidence-honesty.mjs:118-146]
import { rejectClaimsWhenGuidanceBlocked } from "./lib/evidence-honesty.mjs";

export function assertQalive03(evidence, errors) {
  const factual = evidence.factualMetrics ?? evidence.operationalEvidence?.factualSummary;
  if (factual?.humanCorpusFactualPassRate !== 1.0) {
    errors.push("QALIVE-03: humanCorpusFactualPassRate must be 1.0 for any quality-improvement claim");
  }

  const qiGate = evidence.operationalEvidence?.gates?.qualityImprovement;
  if (evidence.qualityImprovementClaimed === true) {
    if (qiGate?.status !== "ok") {
      errors.push("QALIVE-03: qualityImprovementClaimed must be false when gate status is not ok");
    }
    rejectClaimsWhenGuidanceBlocked(qiGate, errors, "operationalEvidence.gates.qualityImprovement", {
      improvementField: "improvementClaimed",
      movementPaths: ["targetedFailureDelta", "deltaRateByReason"],
    });
  }

  // Milestone prose guard: no implicit claim via status "ok" at root when operational insufficient
  if (
    evidence.status === "ok" &&
    evidence.operationalEvidence?.status === "insufficient_sample" &&
    evidence.qualityImprovementClaimed !== false
  ) {
    errors.push("QALIVE-03: root status ok requires qualityImprovementClaimed: false when operational sample insufficient");
  }
}
```

### Pattern 4: Operational Orchestrator Composing Phase 133 (QALIVE-01/02)

**What:** Block A delegates to existing real-quality gate steps; Block B runs 135/136 checkers and 137 aggregate checker.

**When to use:** `npm run operational-quality-release-gate`.

```javascript
// Source: [VERIFIED: run-real-quality-release-gate.mjs step matrix]
const TECHNICAL_STEPS = [
  // Reuse FOCUSED_* constants from run-real-quality-release-gate.mjs
  { id: "corpus-eval", type: "vitest", files: FOCUSED_CORPUS_EVAL_TESTS },
  // ... score-calibration, learning-impact, quality-improvement vitest + evidence checkers
  { id: "v12_3-factual", type: "vitest", files: V12_3_FACTUAL_REGRESSION_TESTS },
  { id: "v12_4-output-learning", type: "vitest", files: OUTPUT_LEARNING_EVAL_TESTS },
  {
    id: "technical-regression",
    type: "node",
    args: ["scripts/check-operational-quality-release-evidence.mjs", "--technical-only", "--run-regression"],
  },
];

const OPERATIONAL_STEPS = [
  { id: "sampling-sufficiency-evidence", type: "node", args: ["scripts/check-sampling-sufficiency-evidence.mjs", "--skip-tests"] },
  { id: "quality-trend-evidence", type: "node", args: ["scripts/check-quality-trend-evidence.mjs", "--skip-tests"] },
  {
    id: "operational-evidence",
    type: "node",
    args: ["scripts/check-operational-quality-release-evidence.mjs", "--evidence", evidencePath, "--skip-tests"],
  },
];
```

### Anti-Patterns to Avoid

- **Treating Phase 133 green as v12.6 operational proof:** v12.5 audit explicitly noted `evaluatedItemCount=0` [VERIFIED: `v12.5-MILESTONE-AUDIT.md:23-35`].
- **Single `milestonePass` boolean:** Violates QALIVE-02 and Phase 135 `technicalRegression` separation.
- **Claiming quality improvement from fixture archetypes:** `qualityImprovement.fixtureMetrics` must stay `evidenceSource: fixture` and cannot satisfy QALIVE-03 alone.
- **Failing technical block when operational sample low:** QALIVE-02 requires independent technical pass.
- **Skipping live CLI refresh before audit:** CI template checks are structural only; operator checkpoint required (mirror 133-04).
- **Replacing Phase 133 gate:** v12.5 regression must remain reproducible; 137 wraps, not deletes.

## Recommended Plan Wave Breakdown

| Plan | Wave | Focus | Requirements | Key deliverables |
|------|------|-------|--------------|------------------|
| **137-01** | 1 | Evidence schema + operational checker | QALIVE-02, QALIVE-03 | `137-EVIDENCE.template.json`, `check-operational-quality-release-evidence.mjs`, `assertQalive02/03` unit tests, `operational-quality-release-evidence` npm script |
| **137-02** | 2 | Operational release gate orchestrator | QALIVE-01, QALIVE-02 | `run-operational-quality-release-gate.mjs`, technical vs operational step blocks, `operational-quality-release-gate` npm script |
| **137-03** | 3 | Live aggregation + regression + CLI registration | QALIVE-01, QALIVE-03 | `--aggregate` merging 130–136 paths; operator refresh doc; register `sample-coverage` / `quality-trend` npm scripts; `--run-regression` wiring |
| **137-04** | 4 | v12.6 milestone audit + closure | QALIVE-04 | `v12.6-MILESTONE-AUDIT.md`, `137-VERIFICATION.md`, ROADMAP/REQUIREMENTS/STATE updates, committed `137-EVIDENCE.json` |

**Operator checkpoint (137-04):** Refresh live evidence against staging DB, run `npm run operational-quality-release-gate -- --run-regression`, human-approve audit when technical green + operational status honestly documented.

## Evidence JSON Schema Recommendations

```json
{
  "schemaVersion": 1,
  "milestoneVersion": "v12.6",
  "capturedAt": "ISO-8601",
  "verifiedAt": "ISO-8601",
  "status": "ok | gaps_found | tech_debt | blocked",
  "qualityImprovementClaimed": false,
  "technicalRegression": {
    "status": "pass | fail",
    "evidenceSource": "technical_regression",
    "denominatorNote": "Deterministic v12.3/v12.4 regression scripts — not human corpus",
    "gateMatrixPass": true,
    "v12_3FactualFidelityRate": 1.0,
    "safetyGuardPassRate": 1.0,
    "creativeValidationScript": "factual_only_pass",
    "outputLearningScript": "pass",
    "sourcePath": ".planning/phases/133-real-quality-release-gate/133-EVIDENCE.json"
  },
  "operationalEvidence": {
    "status": "ok | insufficient_sample | gaps_found",
    "evidenceSource": "live_human",
    "denominatorNote": "Human-evaluated corpus items only",
    "evaluatedItemCount": 0,
    "gates": {
      "calibration": { "status": "insufficient_corpus", "evaluatedItemCount": 0, "sampleGuidance": [], "sourcePath": ".planning/phases/130-.../130-EVIDENCE.json" },
      "impact": { "status": "insufficient_sample", "sourcePath": ".planning/phases/131-.../131-EVIDENCE.json" },
      "qualityImprovement": { "status": "insufficient_sample", "fixtureMetrics": { "evidenceSource": "fixture" }, "sourcePath": ".planning/phases/132-.../132-EVIDENCE.json" },
      "trend": { "status": "insufficient_sample", "sourcePath": ".planning/phases/136-.../136-EVIDENCE.json" }
    },
    "sampleCoverage": {
      "nextGate": "calibration",
      "nextOperatorAction": "Evaluate corpus items in the human-quality queue — at least 5 human evaluations are required.",
      "sourcePath": ".planning/phases/135-.../135-EVIDENCE.json"
    }
  },
  "qualityMetrics": { "humanCorpus": {}, "fixtureValidation": {} },
  "factualMetrics": { "humanCorpusFactualPassRate": 1.0, "v12_3FactualFidelityRate": 1.0, "safetyGuardPassRate": 1.0 },
  "learningImpactMetrics": { "status": "insufficient_sample", "sourcePath": ".planning/phases/131-.../131-EVIDENCE.json" },
  "trendMetrics": { "evidenceSource": "live_human", "status": "insufficient_sample", "sourcePath": ".planning/phases/136-.../136-EVIDENCE.json" },
  "acceptedCaveats": [],
  "automated": {},
  "requirements": [
    { "id": "QALIVE-01", "result": "pass | pending", "automated": "cd app && npm run operational-quality-release-gate" },
    { "id": "QALIVE-02", "result": "pass", "automated": "technicalRegression.status pass independent of operationalEvidence" },
    { "id": "QALIVE-03", "result": "pass", "automated": "qualityImprovementClaimed false when sample insufficient" },
    { "id": "QALIVE-04", "result": "pass", "automated": ".planning/milestones/v12.6-MILESTONE-AUDIT.md" }
  ]
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Technical regression orchestration | New vitest matrix | `run-real-quality-release-gate.mjs` step constants + `runRegressionMode()` | Phase 133 complete and tested |
| Sampling thresholds | Ad-hoc mins in checker | `sampling/thresholds.ts` | Phase 135 canonical module |
| Coverage rollup | Checker-only slice math | `runSampleCoverage()` / `buildSampleCoverageReport()` | Server-side honesty |
| Trend snapshot | Chart-derived metrics | `runQualityTrend()` | Phase 136 engine |
| Evidence source tags | String literals | `EVIDENCE_SOURCE` from `evidence-honesty.mjs` | Phase 135 shared contract |
| Milestone audit format | Freeform doc | `v12.5-MILESTONE-AUDIT.md` structure | Consistent command log + metric tables |
| Improvement claim blocking | Custom delta rules | `rejectClaimsWhenGuidanceBlocked()` | Already used in 135/136 checkers |

**Key insight:** Phase 137 is a **composition milestone** — the planner should budget tasks for wiring and honesty enforcement, not new report engines.

## Common Pitfalls

### Pitfall 1: Conflating technical CI green with operational quality proof

**What goes wrong:** v12.6 milestone audit claims "live quality validated" when `evaluatedItemCount=0`.
**Why it happens:** Phase 133 gate passes with `accepted_gap` and template evidence.
**How to avoid:** QALIVE-02 dual sections; audit cites `operationalEvidence.evaluatedItemCount` separately from `technicalRegression.status`.
**Warning signs:** Audit prose uses "all green" without operational gate table.

### Pitfall 2: Quality improvement claimed from fixture-only delta

**What goes wrong:** `targetedArchetypePassRateAfter` from fixture arm reported as live improvement.
**Why it happens:** Phase 132 evidence mixes fixture and live sections.
**How to avoid:** QALIVE-03 requires `qualityImprovement.gate.status === "ok"` with `live_human` source; `fixtureMetrics` cannot set `qualityImprovementClaimed`.
**Warning signs:** `qualityImprovementClaimed: true` with `evaluatedItemCount < MIN_SLICE_SAMPLE`.

### Pitfall 3: Operational failure aborts technical regression reporting

**What goes wrong:** Orchestrator exits 1 before recording technical pass when sampling template is `insufficient_sample`.
**Why it happens:** Single sequential gate without block separation.
**How to avoid:** Run technical block to completion first; record both statuses; exit 1 only on technical fail.
**Warning signs:** `technicalRegression` missing from evidence when operational check fails.

### Pitfall 4: Missing npm scripts for Phase 135/136 CLIs

**What goes wrong:** Audit documents wrong commands; operators use ad-hoc `npx tsx` paths.
**Why it happens:** `run-sample-coverage.ts` and `run-quality-trend.ts` exist but are not in `package.json` [VERIFIED: `app/package.json` grep — no matches].
**How to avoid:** Register `sample-coverage-evidence` and `quality-trend-evidence` scripts in 137-03.
**Warning signs:** Milestone audit command table omits trend/coverage refresh.

### Pitfall 5: Blended alert or pass fields at 137 root

**What goes wrong:** `overallOperationalPass` hides stale trend or regression flags.
**Why it happens:** Convenience for CI badge.
**How to avoid:** Reuse `BLENDED_FIELD_DENYLIST` from Phase 133/136; separate `trendMetrics.alertFlags` booleans.
**Warning signs:** Single warning string covering insufficient + stale + regression.

## Code Examples

### Reuse Phase 133 regression mode

```javascript
// Source: [VERIFIED: check-real-quality-release-evidence.mjs:725-779]
import { runRegressionMode } from "./check-real-quality-release-evidence.mjs";

const { evidence, errors } = runRegressionMode(baseEvidence, { skipTests: false });
evidence.technicalRegression = {
  status: errors.length === 0 ? "pass" : "fail",
  evidenceSource: "technical_regression",
  gateMatrixPass: evidence.regressionMetrics?.gateMatrixPass ?? false,
  v12_3FactualFidelityRate: evidence.factualMetrics?.v12_3FactualFidelityRate,
  safetyGuardPassRate: evidence.factualMetrics?.safetyGuardPassRate,
};
```

### npm script registration (Wave 3)

```json
"operational-quality-release-gate": "node scripts/run-operational-quality-release-gate.mjs",
"operational-quality-release-evidence": "node scripts/check-operational-quality-release-evidence.mjs --evidence ../.planning/phases/137-operational-quality-release-gate/137-EVIDENCE.template.json --skip-tests",
"sample-coverage-evidence": "npx tsx scripts/run-sample-coverage.ts --all-workspaces",
"quality-trend-evidence": "npx tsx scripts/run-quality-trend.ts --all-workspaces"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v12.5 `real-quality-release-gate` only | v12.6 operational gate wraps technical block | Phase 137 (planned) | QALIVE-02 separation |
| `accepted_gap` closes milestone without live corpus | Operational status + honest `tech_debt` | v12.6 direction | QALIVE-03 blocks claims, not necessarily infra ship |
| Thresholds duplicated per report | `sampling/thresholds.ts` canonical | Phase 135 | 137 imports same constants |
| `trend_global` placeholder | Real `runQualityTrend` in coverage | Phase 136 | 137 trend gate uses live status |
| No `technical_regression` tag | `EVIDENCE_SOURCE.TECHNICAL_REGRESSION` | Phase 135 | 137 checker validates tag |

**Deprecated/outdated:**
- Marking QALIVE complete in Phase 134/135/136 — explicitly deferred [VERIFIED: `STATE.md:190-192`].
- Using v12.5 `133-EVIDENCE.json` alone for v12.6 milestone sign-off — must produce `137-EVIDENCE.json`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | QALIVE-03 blocks **claims** not milestone **closure** when sample insufficient | Pattern 3 | User may require minimum live corpus before any v12.6 ship |
| A2 | Phase 137 wraps Phase 133 technical steps rather than forking a new matrix | Pattern 4 | Fork risks drift from v12.5 regression coverage |
| A3 | `tech_debt` is the correct audit status when technical passes but operational insufficient | Pattern 1 | Product may want `gaps_found` or hard block |
| A4 | Operator must run live CLIs before milestone audit; CI uses committed JSON | Environment | Audit stale if operator skips refresh |
| A5 | `qualityImprovementClaimed` is a new explicit boolean field on 137 evidence | Schema | Planner may prefer inferring from gate status only |

## Open Questions

1. **Minimum evaluatedItemCount for v12.6 milestone closure without `blocked` status?**
   - What we know: Phase 130/135 use global min 5 for `ok`; v12.5 closed at 0 with `tech_debt`.
   - What's unclear: Whether v12.6 requires >0 live evaluations to close at all.
   - Recommendation: Allow closure with `tech_debt` at 0; require `evaluatedItemCount >= 5` only for `status: ok` and `qualityImprovementClaimed: true`.

2. **Should 137 orchestrator invoke live `tsx` CLIs when `DATABASE_URL` is set?**
   - What we know: Phase 133-04 used manual operator refresh; v12.6 is "live operations" milestone.
   - Recommendation: Optional `--refresh-live` flag; default CI path uses committed evidence (mirror 133).

3. **Reuse `assertQa24` for visual target or operational-only gate?**
   - What we know: QA-24 Path B `accepted_gap` allowed v12.5 ship without human corpus.
   - Recommendation: Keep QA-24 logic in Phase 133 artifact; 137 adds QALIVE-03 claim gate — do not weaken factual 1.0 hard gate.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts | ✓ | v25.9.0 | — |
| npm | test/lint/build | ✓ | (project) | — |
| Vitest | Technical regression | ✓ | 4.1.9 | — |
| PostgreSQL (`DATABASE_URL`) | Live evidence CLIs | ✓ (operator) | — | Committed `*-EVIDENCE.template.json` in CI |
| `tsx` | Live CLIs | ✓ | project pin | — |
| graphify | Semantic search | ✗ disabled | — | Manual codebase grep used |

**Missing dependencies with no fallback:**
- None for CI structural gate (committed evidence + vitest).

**Missing dependencies with fallback:**
- `DATABASE_URL` — CI validates schema/honesty; operator generates live `137-EVIDENCE.json` before ship.

**Step 2.6 note:** Phase 137 is primarily code/config + CI; external dependency is operator Postgres for live refresh.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QALIVE-01 | Live aggregate merges 130–136 sourcePaths | unit | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts` | ❌ Wave 1 |
| QALIVE-01 | Sub-checkers (sampling, trend, 133) | script | `node app/scripts/check-operational-quality-release-evidence.mjs --skip-tests` | ❌ Wave 1 |
| QALIVE-02 | Technical pass when operational insufficient | unit | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts -t QALIVE-02` | ❌ Wave 1 |
| QALIVE-02 | Technical fail exits orchestrator | integration | `cd app && npm run operational-quality-release-gate` (after Wave 2) | ❌ Wave 2 |
| QALIVE-03 | Block improvement claim when guidance blocks | unit | `cd app && npm test -- tests/unit/human-quality/sampling/evidence-honesty.test.ts` | ✅ |
| QALIVE-03 | Factual 1.0 hard gate | unit | `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts -t QALIVE-03` | ❌ Wave 1 |
| QALIVE-04 | Audit command log | manual | Operator review `v12.6-MILESTONE-AUDIT.md` | ❌ Wave 4 |
| QALIVE-01 | Full technical matrix | integration | `cd app && npm run operational-quality-release-gate -- --run-regression` | ❌ Wave 3 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/release/operational-quality-release-evidence.test.ts`
- **Per wave merge:** `cd app && npm run operational-quality-release-evidence`
- **Phase gate:** `cd app && npm run operational-quality-release-gate -- --run-regression`

### Wave 0 Gaps

- [ ] `app/scripts/check-operational-quality-release-evidence.mjs` — QALIVE-02/03 validator
- [ ] `app/scripts/run-operational-quality-release-gate.mjs` — QALIVE-01 orchestrator
- [ ] `.planning/phases/137-operational-quality-release-gate/137-EVIDENCE.template.json` — schema
- [ ] `app/tests/unit/release/operational-quality-release-evidence.test.ts` — QALIVE-02/03 tests
- [ ] `app/package.json` scripts `operational-quality-release-gate`, `operational-quality-release-evidence`
- [ ] `app/package.json` scripts `sample-coverage-evidence`, `quality-trend-evidence` (optional aliases)
- [ ] `.planning/milestones/v12.6-MILESTONE-AUDIT.md` — QALIVE-04 artifact

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Gate is CI/local script |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | JSON schema validation in checker; denylist blended root fields |
| V6 Cryptography | no | Reuse existing evidence hashes only |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Evidence JSON tampering | Tampering | `--run-regression` re-runs scripts; vitest proves code unchanged |
| False operational pass | Elevation | Dual status sections + `qualityImprovementClaimed` guard |
| Fixture/live denominator mix | Information | `evidenceSource` tags + `validateDenominatorNote` |
| Caveat without operator acceptance | Repudiation | `acceptedAt`, `rationale`, `acceptedBy` on caveat objects |

## Project Constraints (from workspace rules)

- Use existing Vitest/npm scripts; run tests after code changes [VERIFIED: `app/AGENTS.md` / `@AGENTS.md`].
- No new dependencies unless necessary — compose Phase 133 + 135 + 136 artifacts.
- Do not commit secrets or `.env` in evidence.
- Render platform rules irrelevant (gate is CI/local).

## Sources

### Primary (HIGH confidence)
- `app/scripts/run-real-quality-release-gate.mjs` — Phase 133 orchestrator step matrix
- `app/scripts/check-real-quality-release-evidence.mjs` — `aggregateEvidence`, `runRegressionMode`, `assertQa24`
- `app/scripts/check-sampling-sufficiency-evidence.mjs` — `technicalRegression` gate key
- `app/scripts/check-quality-trend-evidence.mjs` — trend honesty checker
- `app/scripts/lib/evidence-honesty.mjs` — `EVIDENCE_SOURCE`, `rejectClaimsWhenGuidanceBlocked`
- `app/src/server/human-quality/sampling/service.ts` — `runSampleCoverage` parallel rollup
- `app/src/server/human-quality/sampling/coverage.ts` — `nextOperatorAction`
- `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json`
- `.planning/phases/136-quality-trend-dashboard/136-EVIDENCE.template.json`
- `.planning/milestones/v12.5-MILESTONE-AUDIT.md` — audit template
- `.planning/phases/133-real-quality-release-gate/133-RESEARCH.md` — reference pattern

### Secondary (MEDIUM confidence)
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — v12.6 decisions
- `.planning/phases/134-live-corpus-operations/134-RESEARCH.md` — operational boundary
- `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-RESEARCH.md`
- `.planning/phases/136-quality-trend-dashboard/136-RESEARCH.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 100% brownfield composition; no new libraries
- Architecture: HIGH — Phase 133 + 135 `technicalRegression` pattern directly applicable
- Pitfalls: HIGH — v12.5 audit documents empty corpus explicitly
- QALIVE-03 closure vs claim scope: MEDIUM — inferred from REQUIREMENTS wording "cannot claim"

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (stable orchestration); 7 days if checker API changes

## RESEARCH COMPLETE

**Phase:** 137 - Operational Quality Release Gate
**Confidence:** HIGH

### Key Findings
- Phase 137 should **wrap** Phase 133 technical regression and **add** operational evidence from Phases 135–136 — not rebuild calibration/impact/trend engines.
- QALIVE-02 is already partially modeled: Phase 135 `gates.technicalRegression` uses `evidenceSource: technical_regression` separate from `live_human` gates [VERIFIED: `135-EVIDENCE.template.json`].
- QALIVE-03 is stricter than v12.5 QA-24: block `qualityImprovementClaimed` when sample guidance blocks, while still allowing `tech_debt` milestone closure.
- Live refresh requires five `tsx` CLIs; `sample-coverage` and `quality-trend` are **not yet** registered in `package.json` — Wave 3 gap.
- Milestone audit should mirror `v12.5-MILESTONE-AUDIT.md` with separate technical vs operational tables and `nextOperatorAction` from coverage.

### File Created
`.planning/phases/137-operational-quality-release-gate/137-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All components exist in repo |
| Architecture | HIGH | Direct extension of Phase 133 four-plan wave |
| Pitfalls | HIGH | Documented in v12.5 audit + Phase 135 honesty module |
| QALIVE-03 scope (claims vs closure) | MEDIUM | REQUIREMENTS imply claim blocking; no Phase 137 CONTEXT.md |

### Open Questions
- Minimum `evaluatedItemCount` for `status: ok` vs `tech_debt` closure
- Optional `--refresh-live` in orchestrator vs operator-only refresh
- Whether to add explicit `qualityImprovementClaimed` boolean

### Ready for Planning
Research complete. Planner can now create PLAN.md files (recommended 4-plan wave: schema/checker → orchestrator → aggregation/regression → milestone audit).
