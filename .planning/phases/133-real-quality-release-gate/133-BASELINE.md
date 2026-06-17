# Phase 133 Real Quality Release Gate Baseline

Generated at 2026-06-17T18:00:00.000Z.

**Metric separation (QA-23):** human corpus quality, fixture validation, factual rates, learning impact, and accepted caveats are stored in separate JSON sections.

## Human vs Fixture Visual Scores

| Source | Metric | Value | Target | Role |
|---|---|---:|---:|---|
| Human corpus | meanHumanVisualScore | null (insufficient corpus) | 75 | **Primary QA-24 metric** |
| v12.3 fixture matrix | meanQualityScore | 70.17 | 75 | Reference baseline only (70.17) |

## Factual Hard Gates (QA-24)

| Metric | Value | Required |
|---|---:|---:|
| humanCorpusFactualPassRate | 1 | 1.0 |
| v12_3FactualFidelityRate | 1 | 1.0 |
| safetyGuardPassRate | 1 | 1.0 |

## Learning Impact (non-blocking)

| status | insufficient_sample |
| globalVisualScoreDelta | null |

## Accepted Caveats

Count: 1

