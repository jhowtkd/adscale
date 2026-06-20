---
phase: 155
slug: uncertainty-queue
status: complete
created: 2026-06-20
depends_on:
  - 154
requirements:
  - QUEUE-01
  - QUEUE-02
  - QUEUE-03
  - QUEUE-04
---

# Phase 155 - Context

## Goal

Route human judgment only where it teaches — low confidence, new brand, disagreement history, rule conflicts, high-impact export.

## Decisions (--auto)

1. **Uncertainty classifier:** `classifyJudgmentUncertainty()` scores from sample, brand maturity, disagreement, conflicts, export impact, Olhar confidence.
2. **Queue cap:** `buildReviewQueue()` supports 5–15 items, sorted by uncertainty score.
3. **Skip default review:** `shouldSkipHumanReview()` true for low uncertainty on calibrated brands.
4. **Teachable reason:** Each queue item includes teachableSummary from uncertainty reasons.
