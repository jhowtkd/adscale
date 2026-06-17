# Phase 133: Real Quality Release Gate - Research

**Researched:** 2026-06-17
**Domain:** Milestone release gate orchestration — unified human-quality, factual, learning-impact evidence with reproducible CI and explicit caveat acceptance
**Confidence:** HIGH

## Summary

Phase 133 is the **milestone closure** phase for v12.5. Phases 129–132 already shipped the live human corpus, score calibration, learning-impact measurement, and targeted creative-quality improvements — each with its own CLI, evidence checker, and separated metric buckets [VERIFIED: `app/package.json:34-36`, `check-*-evidence.mjs` files]. What does not exist yet is a **single orchestrator** that runs the full QA-22 command matrix, aggregates sub-phase evidence into one `133-EVIDENCE.json`, enforces QA-23 section separation at the milestone layer, and implements QA-24 pass logic (factual 1.0 + human visual target or smaller accepted gap).

The brownfield pattern is established: Phase 123 (`run-creative-release-gate.mjs`), Phase 128 (`run-output-learning-release-gate.mjs`), and Phase 132 (`check-quality-improvement-evidence.mjs --run-regression`) [VERIFIED: codebase grep]. Phase 133 should **compose** these — not reimplement calibration/impact/quality report engines. The orchestrator runs focused vitest subsets + full `npm test`/`lint`/`build`, optionally shells to legacy v12.3/v12.4 check scripts with `--run-regression`, merges live rates into milestone evidence, and writes `v12.5-MILESTONE-AUDIT.md` mirroring `v12.4-MILESTONE-AUDIT.md` [VERIFIED: `.planning/milestones/v12.4-MILESTONE-AUDIT.md`].

**Critical QA-24 tension (resolved for planning):** v12.3 fixture `meanQualityScore` is **70.17** (deterministic matrix, `123-EVIDENCE.json`) while QA-24 refers to **human visual quality** [VERIFIED: `REQUIREMENTS.md:51`, `STATE.md:75`]. The milestone gate must treat **human corpus `meanHumanVisualScore`** as the primary QA-24 metric (from Phase 130 calibration / evaluated corpus), with fixture `meanQualityScore` as a **reference baseline** only. Live operator evidence today shows `insufficient_sample` / `insufficient_corpus` on human arms [VERIFIED: `132-EVIDENCE.json`, `130-EVIDENCE.json`] — the gate must allow milestone pass with honest caveats when factual stays 1.0 and visual gap shrinks vs 70.17, not invent improvement claims.

**Primary recommendation:** Ship 4 plans: (1) unified `133-EVIDENCE` schema + `check-real-quality-release-evidence.mjs` with QA-23/24 rules; (2) `run-real-quality-release-gate.mjs` orchestrator (QA-22); (3) evidence aggregation from 130/131/132 CLIs + `--factual-only` v12.3 regression mode; (4) milestone audit + project state closure.

<user_constraints>
## User Constraints (from STATE.md + Phases 129–132 — no Phase 133 CONTEXT.md)

### Locked Decisions
- [v12.5]: Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- [v12.5]: Calibrate automatic scoring against human judgment while keeping factual metrics separate.
- [v12.5]: Measure whether v12.4 output-learning recommendation/prefill improves comparable real samples.
- [v12.5]: Attack proven visual-quality failures: overload, weak hierarchy, generic template feel, illegible CTA, unfocused composition.
- [v12.5]: Keep factual metrics separate from visual quality and learning-impact metrics.
- [v12.5]: Treat fixture-based v12.4 evidence as necessary but not sufficient for quality claims.
- [Phase 129]: Corpus inclusion explicit/manual; human visual score 0–100; factual pass/fail separate; Postgres canonical.
- [Phase 130]: Calibration evidence separates `visualMetrics` and `factualMetrics`; `insufficient_corpus` honesty when evaluated items below threshold.
- [Phase 131]: Learning impact measured separately; `insufficient_sample` honesty gates; human approved 2026-06-17.
- [Phase 132]: Applied only accepted `visual_overload` ceiling at v1.1.0; regression guard wiring with `--run-regression`.
- [Phase 132]: Phase 133 gate uses `--run-regression` for full v12.3/v12.4 script regression against live evidence.
- [v12.3]: Accepted visual-quality gap `meanQualityScore 70.17 < 75`; **factual fidelity baseline must remain 1.0** in any new release gate.
- [v12.4]: `qualityImprovementPathRate=1.0` and `safetyGuardPassRate=1.0` must stay green.

### Claude's Discretion
- Exact orchestrator/checker filenames (`run-real-quality-release-gate.mjs` vs `run-v12-5-release-gate.mjs`).
- Whether to add `--factual-only` to `check-creative-validation-evidence.mjs` vs handle meanQualityScore failure only in 133 checker.
- Plan wave count (3 vs 4) and whether milestone audit is separate plan.
- `acceptedCaveats` schema field names and operator acceptance workflow (CLI flag vs committed JSON).
- Embedding vs referencing sub-phase evidence files (recommend: embed summaries + `sourcePaths` for audit trail).
- Human `meanVisualScore` aggregation rule (all evaluated items vs post_learning cohort only).

### Deferred Ideas (OUT OF SCOPE)
- Owner dashboard trend lines (LIVEQUAL-02).
- Fine-tuning image models.
- Re-running live OpenAI capture regeneration in CI.
- Weakening factual hard-failure classifiers to improve visual scores.
- New product features beyond milestone closure.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-22 | Milestone release gate runs focused corpus/evaluation tests, score calibration checks, v12.3 factual subset, v12.4 output-learning subset, `npm test`, `npm run lint`, and `npm run build` | `run-real-quality-release-gate.mjs` step matrix below; reuse `FOCUSED_*_TESTS` constants from existing checkers; full suite last |
| QA-23 | Release evidence stores quality metrics, factual metrics, learning-impact metrics and accepted caveats in separate sections | `133-EVIDENCE.json` schema with `BLENDED_FIELD_DENYLIST`; checker rejects root-level conflation; pattern from Phase 128 EVAL-02 and Phase 132 regressionMetrics separation |
| QA-24 | Milestone cannot close as passed unless factual pass rate remains 1.0 and either human visual quality crosses target or remaining gap is smaller and explicitly accepted | Checker enforces `factualMetrics.humanCorpusFactualPassRate === 1.0` + `factualMetrics.v12_3FactualFidelityRate === 1.0`; `qualityMetrics.humanCorpus.meanHumanVisualScore >= 75` OR valid `acceptedCaveats[]` entry with shrunk gap vs 70.17 baseline |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release gate orchestration (QA-22) | CI scripts (`app/scripts/`) | — | Mirrors Phase 123/128; no runtime server dependency for pass/fail |
| Milestone evidence aggregation (QA-23) | CI scripts + `.planning/phases/133-*` | CLI generators (130–132) | Checkers validate JSON; CLIs populate from Postgres when operator runs locally |
| QA-24 threshold / caveat logic | CI evidence checker | Milestone audit markdown | Pass/fail is deterministic on committed evidence; human acceptance recorded in `acceptedCaveats` |
| Human quality metrics | API / Backend (calibration + improvement reports) | CLI `run-score-calibration.ts`, `run-quality-improvement.ts` | Scores computed server-side from evaluated corpus; gate consumes emitted JSON |
| Factual regression (v12.3) | CI vitest subset + optional script | `creative-validation-aggregation.ts` | Hard-failure codes are server constants; tests prove no regression |
| Learning safety (v12.4) | CI vitest + `check-output-learning-evidence.mjs` | `guards.ts` | Safety guards are server-side; fixture eval proves path rate |
| Milestone audit narrative | `.planning/milestones/` docs | `gsd-audit-milestone` (optional) | Human-readable closure artifact separate from machine evidence |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM scripts | v25.9.0 (env) [VERIFIED: shell] | Orchestrator + checkers | Brownfield; all prior gates use `.mjs` |
| Vitest | 4.1.9 registry / ^4.1.5 pin [VERIFIED: npm registry, `app/package.json`] | Focused + full test runs | `npm test` = `vitest run --config config/vitest.config.ts` |
| `tsx` | project pin | Live evidence CLIs | `run-score-calibration.ts`, `run-learning-impact.ts`, `run-quality-improvement.ts` |
| Existing checkers | — | Sub-phase validation | `check-score-calibration-evidence.mjs`, `check-learning-impact-evidence.mjs`, `check-quality-improvement-evidence.mjs`, `check-output-learning-evidence.mjs`, `check-creative-validation-evidence.mjs` |
| TypeScript | project pin | Guard unit tests | `creative-validation-evidence-guard.test.ts` pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `execFileSync` (node:child_process) | built-in | Shell vitest + node checkers | All orchestrators |
| Drizzle + Postgres | project pin | Live evidence generation | Operator pre-gate only; CI uses committed JSON |
| Zod | project pin | API validation (unchanged) | Not in gate scripts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New unified orchestrator | Chain existing npm scripts only | No single QA-23 evidence file; harder QA-24 enforcement |
| Single mega-checker | Compose existing checkers | Prefer composition — avoids duplicating 130–132 validation logic |
| Require `check-creative-validation --stage final` pass | v12.3 factual vitest subset only | Full final stage fails on QA-19 (70.17<75) — blocks milestone incorrectly |
| Fixture-only QA-24 | Human corpus mean only | Violates v12.5 locked decision |

**Installation:** None — no new npm dependencies.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Operator (optional, pre-CI): DATABASE_URL                                    │
│  run-score-calibration.ts → 130-EVIDENCE.json                                │
│  run-learning-impact.ts   → 131-EVIDENCE.json                                │
│  run-quality-improvement.ts → 132-EVIDENCE.json (--run-regression locally)   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ run-real-quality-release-gate.mjs (QA-22)                                    │
│  1. Focused corpus/calibration/impact/improvement vitest subsets             │
│  2. Score calibration evidence check                                         │
│  3. Learning impact evidence check                                           │
│  4. Quality improvement evidence check (+ --run-regression when flagged)     │
│  5. v12.3 factual vitest (gate-failure-matrix, creative-quality-gate)        │
│  6. v12.4 output-learning vitest subset + evidence check                       │
│  7. npm test → npm run lint → npm run build                                  │
│  8. check-real-quality-release-evidence.mjs → 133-EVIDENCE.json                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│ qualityMetrics    │ │ factualMetrics    │ │ learningImpactMetrics     │
│ human + fixture   │ │ corpus + v12.3    │ │ from 131 evidence         │
└────────┬─────────┘ └────────┬─────────┘ └────────────┬─────────────┘
         │                    │                        │
         └────────────────────┼────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ acceptedCaveats[] (QA-24) + requirements[QA-22..24]                        │
│  → 133-VERIFICATION.md + v12.5-MILESTONE-AUDIT.md + STATE/ROADMAP updates   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app/scripts/
├── run-real-quality-release-gate.mjs      # NEW — QA-22 orchestrator
├── check-real-quality-release-evidence.mjs # NEW — QA-23/24 validator
├── run-creative-release-gate.mjs          # existing v12.3 (reference)
├── run-output-learning-release-gate.mjs   # existing v12.4 (reference)
├── check-quality-improvement-evidence.mjs # existing; --run-regression
├── check-score-calibration-evidence.mjs
├── check-learning-impact-evidence.mjs
└── check-output-learning-evidence.mjs

.planning/phases/133-real-quality-release-gate/
├── 133-EVIDENCE.template.json
├── 133-EVIDENCE.json                      # committed after operator run
├── 133-BASELINE.md                        # generated by checker
├── 133-VERIFICATION.md                    # generated by checker
└── 133-RESEARCH.md

.planning/milestones/
└── v12.5-MILESTONE-AUDIT.md               # NEW — closure artifact
```

### Pattern 1: Release Gate Orchestrator (mirror Phase 128)

**What:** Sequential steps with `writeAutomatedStep` updating phase evidence JSON.
**When to use:** QA-22 full milestone gate.
**Example:**

```javascript
// Source: app/scripts/run-output-learning-release-gate.mjs (Phase 128)
const FOCUSED_CORPUS_EVAL_TESTS = [
  "tests/unit/human-quality/human-quality-corpus.test.ts",
  "tests/unit/human-quality/human-quality-service.test.ts",
  "tests/unit/human-quality/calibration/compare.test.ts",
  "tests/unit/human-quality/improvement/reevaluate.test.ts",
  "tests/unit/human-quality/impact/report.test.ts",
];
const CALIBRATION_TESTS = [ /* from check-score-calibration-evidence.mjs */ ];
const V12_3_FACTUAL_TESTS = [
  "tests/unit/ai/gate-failure-matrix.test.ts",
  "tests/unit/ai/creative-quality-gate.test.ts",
];
const V12_4_OUTPUT_LEARNING_TESTS = [
  "tests/unit/output-learning/output-learning-eval-matrix.test.ts",
  "tests/unit/output-learning/output-learning-pipeline-eval.test.ts",
  "src/server/output-learning/safety/guards.test.ts",
];

const steps = [
  ["npm", ["test", "--", ...FOCUSED_CORPUS_EVAL_TESTS], "corpus-eval"],
  ["npm", ["test", "--", ...CALIBRATION_TESTS], "score-calibration"],
  ["npm", ["test", "--", ...V12_3_FACTUAL_TESTS], "v12_3-factual"],
  ["npm", ["test", "--", ...V12_4_OUTPUT_LEARNING_TESTS], "v12_4-output-learning"],
  ["npm", ["test"], "unit"],
  ["npm", ["run", "lint"], "lint"],
  ["npm", ["run", "build"], "build"],
];
// Then: node scripts/check-real-quality-release-evidence.mjs [--run-regression]
```

### Pattern 2: Metric Separation (QA-23)

**What:** Top-level buckets only; denylist blended fields at root.
**When to use:** All milestone evidence validation.
**Example:**

```javascript
// Source: app/scripts/check-quality-improvement-evidence.mjs (Phase 132)
const BLENDED_FIELD_DENYLIST = [
  "overallPass", "combinedPass", "blendedPassRate",
  "qualityImprovementPathRate", "safetyGuardPassRate", "factualFidelityRate",
  "overallQualityPass", "combinedScore", "improvementClaimed",
];
// Require: qualityMetrics, factualMetrics, learningImpactMetrics, acceptedCaveats
// Reject if any denylist field appears at evidence root
```

### Pattern 3: QA-24 Pass Logic (meanQualityScore ≥75 vs accepted gap)

**What:** Dual-path milestone pass with explicit caveat object.
**When to use:** `check-real-quality-release-evidence.mjs` final validation.

```javascript
// Source: derived from QA-24, v12.3-MILESTONE-AUDIT.md accepted_gap pattern
const HUMAN_VISUAL_TARGET = 75;
const V12_3_FIXTURE_BASELINE = 70.17; // from 123-EVIDENCE.json aggregate [VERIFIED]

function assertQa24(evidence, errors) {
  const factual = evidence.factualMetrics;
  if (factual.humanCorpusFactualPassRate !== 1.0) {
    errors.push("QA-24: humanCorpusFactualPassRate must be 1.0");
  }
  if (factual.v12_3FactualFidelityRate !== 1.0) {
    errors.push("QA-24: v12_3FactualFidelityRate must be 1.0");
  }

  const meanHuman = evidence.qualityMetrics?.humanCorpus?.meanHumanVisualScore;
  if (meanHuman != null && meanHuman >= HUMAN_VISUAL_TARGET) {
    return; // Path A: target met
  }

  const caveat = evidence.acceptedCaveats?.find(
    (c) => c.id === "visual_quality_gap" && c.status === "accepted_gap"
  );
  if (!caveat) {
    errors.push(
      `QA-24: meanHumanVisualScore ${meanHuman ?? "null"} < ${HUMAN_VISUAL_TARGET} and no accepted_gap caveat`
    );
    return;
  }

  const current = caveat.currentValue ?? meanHuman ?? V12_3_FIXTURE_BASELINE;
  const priorGap = HUMAN_VISUAL_TARGET - (caveat.priorBaseline ?? V12_3_FIXTURE_BASELINE);
  const currentGap = HUMAN_VISUAL_TARGET - current;
  if (currentGap >= priorGap) {
    errors.push(
      `QA-24: gap ${currentGap.toFixed(2)} not smaller than prior gap ${priorGap.toFixed(2)}`
    );
  }
  if (!caveat.acceptedAt || !caveat.rationale) {
    errors.push("QA-24: accepted_gap caveat requires acceptedAt and rationale");
  }
}
```

**meanQualityScore threshold handling:**

| Metric | Source | Threshold | QA-24 role |
|--------|--------|-----------|------------|
| `meanHumanVisualScore` | Evaluated human corpus (130/132 reports) | ≥75 | **Primary** pass/fail for human quality |
| `meanQualityScore` (fixture) | `123-EVIDENCE.json` aggregate | ≥75 (QA-19) | **Reference baseline** 70.17; inherited accepted_gap if human corpus insufficient |
| `factualFidelityRate` | 123-EVIDENCE + regression | 1.0 | **Hard gate** — no caveat allowed |
| `humanCorpusFactualPassRate` | 130/132 factualMetrics | 1.0 | **Hard gate** — no caveat allowed |

When live human corpus is `insufficient_corpus` / `insufficient_sample`, Path B requires operator to commit `acceptedCaveats` documenting: (1) inherited v12.3 fixture baseline 70.17, (2) any fixture/human movement from Phase 132 (`visual_overload` ceiling), (3) explicit acceptance that target 75 is not yet met but gap shrank or regression guards hold.

### Pattern 4: `--run-regression` (from Phase 132)

**What:** Re-run v12.3/v12.4 evidence scripts and merge live rates.
**When to use:** Milestone gate (not default CI template check).

```bash
# Source: app/scripts/check-quality-improvement-evidence.mjs:368-421
node app/scripts/check-creative-validation-evidence.mjs --stage final  # expect QA-19 gap
node app/scripts/check-output-learning-evidence.mjs --skip-tests
# 133 checker: extract factualFidelityRate=1.0, ignore meanQualityScore failure for QA-24
# OR add --factual-only flag to creative validation checker (planner discretion)
```

### Anti-Patterns to Avoid

- **Requiring full `creative-release-gate` pass:** QA-19 fixture gap blocks incorrectly [VERIFIED: `132-03-SUMMARY.md`].
- **Blending learning impact into quality pass:** Violates v12.5 locked decisions and QA-23.
- **Treating `insufficient_sample` as pass:** Phase 131/132 honesty gates must propagate — milestone can pass with caveats, not false improvement claims.
- **Skipping full `npm test`:** QA-22 explicitly requires it; focused subsets are additive, not replacement.
- **Hand-rolling eval matrix:** Use existing `output-learning-eval-matrix.ts` and corpus fixtures.

## Recommended Plan Wave Breakdown

| Plan | Wave | Focus | Requirements | Key deliverables |
|------|------|-------|--------------|------------------|
| **133-01** | 1 | Evidence schema + checker | QA-23, QA-24 | `133-EVIDENCE.template.json`, `check-real-quality-release-evidence.mjs`, unit test for QA-24 paths |
| **133-02** | 2 | Release gate orchestrator | QA-22 | `run-real-quality-release-gate.mjs`, `real-quality-release-gate` npm script, `FOCUSED_*_TESTS` constants |
| **133-03** | 3 | Evidence aggregation + regression mode | QA-22, QA-24 | Embed summaries from 130/131/132 paths; `--run-regression`; optional `--factual-only` on creative validation checker |
| **133-04** | 4 | Milestone closure | QA-22–24 | `133-VERIFICATION.md`, `v12.5-MILESTONE-AUDIT.md`, ROADMAP/REQUIREMENTS/STATE updates |

**Checkpoint (133-04):** Operator runs live CLIs against staging DB, commits `133-EVIDENCE.json`, runs full gate with `--run-regression`, approves `acceptedCaveats` if human corpus still below 75.

## Evidence JSON Schema Recommendations

```json
{
  "schemaVersion": 1,
  "milestoneVersion": "v12.5",
  "capturedAt": "ISO-8601",
  "verifiedAt": "ISO-8601",
  "status": "passed | gaps_found | blocked",
  "qualityMetrics": {
    "humanCorpus": {
      "evaluatedItemCount": 0,
      "meanHumanVisualScore": null,
      "calibrationStatus": "ok | insufficient_corpus",
      "qualityImprovementStatus": "ok | insufficient_sample",
      "targetedFailureDelta": { "visual_overload": null },
      "sourcePath": ".planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.json"
    },
    "fixtureValidation": {
      "meanQualityScore": 70.17,
      "factualFidelityRate": 1.0,
      "sourcePath": ".planning/phases/123-visual-validation-gate/123-EVIDENCE.json",
      "note": "Deterministic v12.3 matrix — not human corpus"
    }
  },
  "factualMetrics": {
    "humanCorpusFactualPassRate": 1.0,
    "v12_3FactualFidelityRate": 1.0,
    "v12_3RegressionSubsetPassed": true,
    "fidelityHardFailureCount": 0,
    "safetyGuardPassRate": 1.0
  },
  "learningImpactMetrics": {
    "status": "ok | insufficient_sample",
    "learnedFactualPassRate": 1.0,
    "globalVisualScoreDelta": null,
    "sourcePath": ".planning/phases/131-learning-impact-measurement/131-EVIDENCE.json"
  },
  "acceptedCaveats": [
    {
      "id": "visual_quality_gap",
      "status": "accepted_gap",
      "metric": "meanHumanVisualScore",
      "target": 75,
      "priorBaseline": 70.17,
      "priorBaselineSource": "v12.3-QA-19-fixture",
      "currentValue": null,
      "gapToTarget": null,
      "priorGapToTarget": 4.83,
      "rationale": "Human post_learning corpus not yet populated; fixture factual 1.0; visual_overload ceiling deployed",
      "acceptedAt": "2026-06-17",
      "acceptedBy": "operator"
    }
  ],
  "regressionMetrics": {
    "gateMatrixPass": true,
    "creativeValidationScript": "factual_only_pass",
    "outputLearningScript": "pass"
  },
  "automated": {
    "corpus-eval": "pass",
    "score-calibration": "pass",
    "v12_3-factual": "pass",
    "v12_4-output-learning": "pass",
    "unit": "pass",
    "lint": "pass",
    "build": "pass"
  },
  "requirements": [
    { "id": "QA-22", "result": "pass", "automated": "cd app && npm run real-quality-release-gate" },
    { "id": "QA-23", "result": "pass", "automated": "node app/scripts/check-real-quality-release-evidence.mjs" },
    { "id": "QA-24", "result": "pass | accepted_gap", "automated": "node app/scripts/check-real-quality-release-evidence.mjs" }
  ]
}
```

**Validation rules (checker):**
- Root MUST have exactly four metric sections + `acceptedCaveats` array (may be empty only if Path A passes).
- `BLENDED_FIELD_DENYLIST` at root (reuse Phase 132 list).
- Sub-phase `sourcePath` files must exist when status is `passed` (or document `blocked` with reason).
- `learningImpactMetrics.status === "insufficient_sample"` is allowed at milestone — does not block if QA-24 visual path satisfied; must not claim learning uplift in audit prose.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Milestone test orchestration | Custom bash pipeline | `run-real-quality-release-gate.mjs` mirroring 128 | Proven `writeAutomatedStep` + evidence update pattern |
| Calibration report | New comparison engine | `run-score-calibration.ts` + existing checker | Phase 130 complete |
| Learning impact report | New slice logic | `run-learning-impact.ts` + checker | Phase 131 complete |
| Quality re-evaluation | New before/after engine | `run-quality-improvement.ts` + checker | Phase 132 complete |
| Factual hard-failure codes | New taxonomy | `FIDELITY_HARD_FAILURE_CODES` in `creative-validation-aggregation.ts` | Single source since Phase 117 |
| Output learning eval matrix | Ad-hoc scenarios | `output-learning-eval-matrix.ts` | Phase 128 fixed matrix |
| Milestone audit format | Freeform doc | `v12.4-MILESTONE-AUDIT.md` structure | Consistent requirement tables + command log |

## Common Pitfalls

### Pitfall 1: Treating v12.3 `--stage final` as blocking regression

**What goes wrong:** `--run-regression` fails on `meanQualityScore 70.17 < 75` even when factual is 1.0.
**Why it happens:** `check-creative-validation-evidence.mjs` bundles QA-19 visual threshold into final stage [VERIFIED: line 509-512].
**How to avoid:** Add `--factual-only` flag OR teach 133 checker to run vitest subset + read `factualFidelityRate` without requiring final stage exit 0.
**Warning signs:** Gate red despite `factualFidelityRate: 1.0` in 123-EVIDENCE.

### Pitfall 2: Using fixture score for QA-24 human quality claim

**What goes wrong:** Milestone closes on 70.17 fixture improvement without human corpus proof.
**Why it happens:** v12.3 baseline is well-documented; human corpus may be empty.
**How to avoid:** Primary QA-24 metric = `meanHumanVisualScore`; fixture is reference only; `insufficient_corpus` requires explicit caveat.
**Warning signs:** `evaluatedItemCount: 0` but `status: passed` without `acceptedCaveats`.

### Pitfall 3: Blended pass field at milestone root

**What goes wrong:** Single `milestonePass: true` hides factual regression.
**Why it happens:** Convenience for CI badge.
**How to avoid:** Reuse `BLENDED_FIELD_DENYLIST`; separate `requirements[]` per QA ID.
**Warning signs:** Audit prose says "all green" while learning impact is `insufficient_sample`.

### Pitfall 4: Skipping full npm test

**What goes wrong:** Focused subsets pass but unrelated regression ships.
**Why it happens:** Runtime optimization.
**How to avoid:** QA-22 ordering — focused first, full `npm test` before lint/build.
**Warning signs:** Gate script missing `["npm", ["test"], "unit"]` step.

### Pitfall 5: Committed evidence stale vs live Postgres

**What goes wrong:** CI passes template; production corpus changed.
**Why it happens:** CI uses `--skip-tests` templates by default for sub-phases.
**How to avoid:** Milestone gate uses real `133-EVIDENCE.json` + operator checkpoint; checker validates `capturedAt` freshness optional warning.
**Warning signs:** `130-EVIDENCE.json` shows `evaluatedItemCount: 0` at audit time.

## Code Examples

### Sub-checker composition

```javascript
// Source: pattern from check-quality-improvement-evidence.mjs:515-518
import { execFileSync } from "node:child_process";

function runSubChecker(script, args, errors, label) {
  try {
    execFileSync("node", [script, ...args], { stdio: "inherit" });
  } catch {
    errors.push(`${label} failed`);
  }
}

runSubChecker("app/scripts/check-score-calibration-evidence.mjs",
  ["--evidence", phase130Evidence, "--skip-tests"], errors, "CALIB");
```

### npm script registration

```json
"real-quality-release-gate": "node scripts/run-real-quality-release-gate.mjs",
"real-quality-release-evidence": "node scripts/check-real-quality-release-evidence.mjs --evidence ../.planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json --skip-tests"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixture-only v12.4 eval | Human corpus + calibration (v12.5) | Phases 129–130 | Milestone must cite human metrics |
| Single release gate per milestone | Composed sub-gates + unified 133 gate | Phase 133 (planned) | QA-22 runs all subsets |
| QA-19 accepted_gap at v12.3 only | QA-24 smaller-gap acceptance at v12.5 | Phase 133 | Human quality gap can shrink without hitting 75 |
| `creative-release-gate` for v12.5 | `real-quality-release-gate` | Phase 133 | Avoid conflating fixture gate with human gate |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | QA-24 "human visual quality" means `meanHumanVisualScore` from evaluated corpus, not fixture `meanQualityScore` | Pattern 3 | Wrong metric invalidates milestone claim |
| A2 | Milestone can pass with `insufficient_sample` on learning/quality arms if QA-24 factual=1.0 and caveat documents visual gap | Pitfall 2 | User may require human corpus minimum count |
| A3 | `--run-regression` should not require `check-creative-validation --stage final` exit 0 | Pattern 4 | Full script regression may need checker flag |
| A4 | `priorBaseline` for gap comparison defaults to 70.17 from v12.3 fixture | Pattern 3 | If human baseline differs, caveat must override |
| A5 | Phase 133 does not re-open Phase 123 PNG regeneration | Deferred | Operator may expect QA-19 fix |

## Open Questions

1. **Minimum human corpus count for milestone pass without caveat?**
   - What we know: Phase 130 uses min 5 for calibration `ok`; Phase 131 uses min 5 global for impact.
   - What's unclear: Whether QA-24 allows zero human items with only fixture + caveat.
   - Recommendation: Allow pass with caveat when `evaluatedItemCount < 5`; document in `acceptedCaveats.rationale`.

2. **`--factual-only` on creative validation checker vs 133-only handling?**
   - What we know: 132-03 already documents final stage failure on meanQualityScore.
   - Recommendation: Add `--factual-only` to `check-creative-validation-evidence.mjs` in 133-03 for clean `--run-regression` semantics.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts | ✓ | v25.9.0 | — |
| npm | test/lint/build | ✓ | (project) | — |
| Vitest | QA-22 tests | ✓ | 4.1.9 registry | — |
| PostgreSQL (`DATABASE_URL`) | Live evidence CLIs | ✓ (operator) | — | Use committed `*-EVIDENCE.json` templates in CI |
| OpenAI API | Live capture regen | ✗ in CI | — | Out of scope — use committed 123 evidence |
| graphify | Semantic search | ✗ disabled | — | Manual codebase grep used |

**Missing dependencies with no fallback:**
- None for CI gate (committed evidence + vitest).

**Missing dependencies with fallback:**
- `DATABASE_URL` — CI validates template/schema; operator generates live `133-EVIDENCE.json` before ship.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/human-quality/improvement/reevaluate.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QA-22 | Corpus/evaluation focused tests | unit | `cd app && npm test -- tests/unit/human-quality` | ✅ |
| QA-22 | Score calibration checks | unit + script | `cd app && npm run score-calibration-evidence` | ✅ |
| QA-22 | v12.3 factual subset | unit | `cd app && npm test -- tests/unit/ai/gate-failure-matrix.test.ts tests/unit/ai/creative-quality-gate.test.ts` | ✅ |
| QA-22 | v12.4 output-learning subset | unit + script | `cd app && npm test -- tests/unit/output-learning/output-learning-pipeline-eval.test.ts src/server/output-learning/safety/guards.test.ts` | ✅ |
| QA-22 | Full test/lint/build | integration | `cd app && npm test && npm run lint && npm run build` | ✅ |
| QA-23 | Metric section separation | script | `node app/scripts/check-real-quality-release-evidence.mjs --skip-tests` | ❌ Wave 1 |
| QA-24 | Factual 1.0 + visual target or caveat | unit + script | `cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts` | ❌ Wave 1 |
| QA-24 | Regression guards at 1.0 | script | `node app/scripts/check-real-quality-release-evidence.mjs --run-regression` | ❌ Wave 3 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts` (after Wave 1)
- **Per wave merge:** `cd app && npm run real-quality-release-evidence` (template checker)
- **Phase gate:** `cd app && npm run real-quality-release-gate` (full QA-22)

### Wave 0 Gaps

- [ ] `app/scripts/check-real-quality-release-evidence.mjs` — QA-23/24 validator
- [ ] `app/scripts/run-real-quality-release-gate.mjs` — QA-22 orchestrator
- [ ] `.planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json` — schema
- [ ] `app/tests/unit/release/real-quality-release-evidence.test.ts` — QA-24 path A/B tests
- [ ] `app/package.json` scripts `real-quality-release-gate`, `real-quality-release-evidence`
- [ ] Optional: `--factual-only` on `check-creative-validation-evidence.mjs`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Gate is CI/local script — no auth surface |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | JSON schema validation in checker; reject unknown blended fields |
| V6 Cryptography | no | sha256 in 123 evidence only — reuse, don't reimplement |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Evidence JSON tampering | Tampering | `--run-regression` re-runs scripts; vitest proves code unchanged |
| False milestone pass via blended metric | Elevation | `BLENDED_FIELD_DENYLIST` + separate requirements rows |
| Caveat without operator acceptance | Repudiation | Require `acceptedAt`, `rationale`, `acceptedBy` on caveat objects |
| Stale committed evidence | Information | `sourcePath` + `capturedAt`; audit documents command log |

## Project Constraints (from workspace rules)

- Use existing Vitest/npm scripts; run tests after code changes [VERIFIED: `app/AGENTS.md` → `@AGENTS.md` build/test rules].
- No new dependencies unless necessary — compose existing checkers.
- Do not commit secrets or `.env` files in evidence.
- Render platform rules irrelevant (gate is CI/local, not deploy).

## Sources

### Primary (HIGH confidence)
- `app/scripts/run-output-learning-release-gate.mjs` — Phase 128 orchestrator pattern
- `app/scripts/run-creative-release-gate.mjs` — Phase 123 orchestrator pattern
- `app/scripts/check-quality-improvement-evidence.mjs` — regression + honesty gates
- `app/scripts/check-score-calibration-evidence.mjs` — calibration test bundle
- `app/scripts/check-learning-impact-evidence.mjs` — impact test bundle
- `app/scripts/check-output-learning-evidence.mjs` — v12.3/v12.4 subset definitions
- `.planning/milestones/v12.4-MILESTONE-AUDIT.md` — milestone audit template
- `.planning/milestones/v12.3-MILESTONE-AUDIT.md` — accepted_gap precedent
- `.planning/phases/132-targeted-creative-quality-improvements/132-EVIDENCE.json` — live insufficient_sample state

### Secondary (MEDIUM confidence)
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — v12.5 decisions
- `.planning/phases/128-evaluation-and-release-gate/128-03-PLAN.md` — release gate task breakdown
- `.planning/phases/132-targeted-creative-quality-improvements/132-03-PLAN.md` — `--run-regression` wiring

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components exist in repo; no new libraries
- Architecture: HIGH — direct composition of Phases 123/128/130–132 patterns
- Pitfalls: HIGH — 132-03-SUMMARY documents meanQualityScore failure explicitly
- QA-24 human vs fixture metric: MEDIUM — inferred from REQUIREMENTS wording + v12.5 direction; confirm in discuss if needed

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable orchestration); 7 days if checker API changes

## RESEARCH COMPLETE

**Phase:** 133 - Real Quality Release Gate
**Confidence:** HIGH

### Key Findings
- Phase 133 should **compose** existing per-phase checkers and orchestrators — not rebuild calibration/impact/quality engines.
- QA-22 step matrix is fully mappable to existing vitest bundles from `check-score-calibration-evidence.mjs`, `check-learning-impact-evidence.mjs`, `check-output-learning-evidence.mjs`, and `tests/unit/human-quality/**`.
- QA-24 must use **human corpus `meanHumanVisualScore`** as primary metric; v12.3 fixture `70.17` is the reference baseline for "smaller gap" comparison; factual 1.0 is non-negotiable.
- `--run-regression` will fail `check-creative-validation --stage final` on QA-19 unless `--factual-only` mode is added or 133 checker decouples factual from visual threshold.
- Live evidence is honestly `insufficient_sample` / `insufficient_corpus` — milestone closure requires `acceptedCaveats` Path B unless operator populates post_learning human evaluations.

### File Created
`.planning/phases/133-real-quality-release-gate/133-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | 100% brownfield composition |
| Architecture | HIGH | Mirror 128/123 with verified file paths |
| Pitfalls | HIGH | Documented in 132-03-SUMMARY and 123-VERIFICATION |
| QA-24 metric choice | MEDIUM | REQUIREMENTS imply human quality; no Phase 133 CONTEXT.md lock |

### Open Questions
- Minimum human corpus count without caveat
- Whether to add `--factual-only` to creative validation checker vs handle only in 133 checker

### Ready for Planning
Research complete. Planner can now create PLAN.md files (recommended 4-plan wave: schema/checker → orchestrator → aggregation/regression → milestone audit).
