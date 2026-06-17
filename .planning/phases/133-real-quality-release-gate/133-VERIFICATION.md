---
phase: 133-real-quality-release-gate
verified: 2026-06-17T16:53:14.103Z
status: passed
requirements: [QA-22, QA-23, QA-24]
---

# Phase 133: Real Quality Release Gate Verification

**Status:** passed

## Goal-Backward (ROADMAP success criteria)

| # | Criterion | Evidence | Result |
|---|---|---|---|
| 1 | Release gate runs corpus/eval tests, calibration checks, v12.3 factual subset, v12.4 output-learning subset, `npm test`, `lint`, `build` | `automated` block in 133-EVIDENCE.json; `npm run real-quality-release-gate -- --run-regression` exit 0 | pass |
| 2 | Evidence separates quality, factual, learning-impact metrics and accepted caveats | `qualityMetrics`, `factualMetrics`, `learningImpactMetrics`, `acceptedCaveats` in 133-EVIDENCE.json | pass |
| 3 | Factual pass rate 1.0 and quality crosses target or smaller gap explicitly accepted | factual rates 1.0; `acceptedCaveats[visual_quality_gap]` gap 3 < prior 4.83 | pass (accepted_gap) |

## Requirement Rows

| ID | Description | Automated command | Result |
|---|---|---|---|
| QA-22 | Milestone release gate command matrix | `cd app && npm run real-quality-release-gate -- --run-regression` | pass |
| QA-23 | Metric section separation | `node app/scripts/check-real-quality-release-evidence.mjs --skip-tests` | pass |
| QA-24 | Factual 1.0 + human visual target or accepted gap | `node app/scripts/check-real-quality-release-evidence.mjs --skip-tests` | pass (accepted_gap) |

**QA-24 note:** `qualityMetrics.fixtureValidation.meanQualityScore` (70.17) is reference baseline only (v12.3 QA-19). Primary QA-24 metric is `qualityMetrics.humanCorpus.meanHumanVisualScore` (null — insufficient corpus; Path B caveat accepted).

## Metric Buckets (QA-23)

| Bucket | Key field | Value |
|---|---|---|
| qualityMetrics.humanCorpus | meanHumanVisualScore | null |
| qualityMetrics.fixtureValidation | meanQualityScore | 70.16666666666667 |
| factualMetrics | humanCorpusFactualPassRate | 1 |
| factualMetrics | v12_3FactualFidelityRate | 1 |
| learningImpactMetrics | status | ok |
| acceptedCaveats | count | 1 |
| regressionMetrics | gateMatrixPass | true |

## Commands

```bash
cd app && npm run real-quality-release-gate -- --run-regression
node app/scripts/check-real-quality-release-evidence.mjs --skip-tests
node app/scripts/check-real-quality-release-evidence.mjs --aggregate
cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts
```
