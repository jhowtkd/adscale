# Phase 133 Real Quality Release Gate Baseline

Generated at 2026-06-17T17:43:41.935Z.

**Metric separation (QA-23):** human corpus quality, fixture validation, factual rates, learning impact, regression metrics, and accepted caveats are stored in separate JSON sections.

## Human vs Fixture Visual Scores

| Source | Metric | Current | Target | Role |
|---|---|---:|---:|---|
| Human corpus | meanHumanVisualScore | null | 75 | Primary QA-24 metric; insufficient corpus |
| v12.3 fixture matrix | meanQualityScore | 70.17 | 75 | Reference baseline only |
| QA-24 Path B caveat | currentValue | 72 | 75 | Accepted gap reference while corpus pending |

**Comparison:** Human mean is unavailable because `evaluatedItemCount=0`. The accepted caveat documents a shrunk visual gap to target: 3 vs prior 4.83.

## Factual Hard Gates (QA-24)

| Metric | Current | Required |
|---|---:|---:|
| humanCorpusFactualPassRate | 1 | 1.0 |
| v12_3FactualFidelityRate | 1 | 1.0 |
| safetyGuardPassRate | 1 | 1.0 |
| v12_3RegressionSubsetPassed | true | true |

## Learning Impact

| Field | Value | Note |
|---|---|---|
| status | insufficient_sample | Live refresh found zero evaluated corpus items |
| globalVisualScoreDelta | null | No live uplift claim |

## Regression (QA-22)

| Field | Value |
|---|---|
| gateMatrixPass | true |
| creativeValidationScript | factual_only_pass |
| outputLearningScript | pass |

## Accepted Caveats

Count: 1 — `visual_quality_gap` (`accepted_gap`, `gapToTarget=3`, `priorGapToTarget=4.83`).
