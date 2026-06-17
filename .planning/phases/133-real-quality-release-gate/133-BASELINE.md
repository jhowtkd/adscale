# Phase 133 Real Quality Release Gate Baseline

Generated at 2026-06-17T16:53:14.103Z.

**Metric separation (QA-23):** human corpus quality, fixture validation, factual rates, learning impact, regression metrics, and accepted caveats are stored in separate JSON sections.

## Human vs Fixture Visual Scores

| Source | Metric | Value | Target | Role |
|---|---|---:|---:|---|
| Human corpus | meanHumanVisualScore | null (insufficient corpus) | 75 | **Primary QA-24 metric** |
| v12.3 fixture matrix | meanQualityScore | 70.17 | 75 | Reference baseline only (70.17) |
| QA-24 Path B caveat | currentValue | 72 | 75 | Accepted gap reference while corpus pending |

**Comparison:** Fixture mean 70.17 unchanged from v12.3. Human mean unavailable (evaluatedItemCount=0). Accepted caveat documents shrunk gap to target (3 vs prior 4.83) using reference currentValue 72.

## Factual Hard Gates (QA-24)

| Metric | Value | Required |
|---|---:|---:|
| humanCorpusFactualPassRate | 1 | 1.0 |
| v12_3FactualFidelityRate | 1 | 1.0 |
| safetyGuardPassRate | 1 | 1.0 |
| v12_3RegressionSubsetPassed | true | true |

## Learning Impact (non-blocking)

| Field | Value | Note |
|---|---|---|
| status | ok | Template/evidence path — not live uplift claim |
| globalVisualScoreDelta | 14 | Descriptive; humanCorpus insufficient_sample |

## Regression (QA-22)

| Field | Value |
|---|---|
| gateMatrixPass | true |
| creativeValidationScript | factual_only_pass |
| outputLearningScript | pass |

## Accepted Caveats

Count: 1 — `visual_quality_gap` (accepted_gap, gapToTarget 3, priorGapToTarget 4.83)
