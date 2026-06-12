---
phase: 105-creative-hypotheses-and-variant-comparison
plan: 01
subsystem: performance-hypothesis
tags: [hypothesis, comparison, drizzle, deterministic]
requires: [104-manual-and-csv-result-import]
provides: [hypothesis-schema, comparison-engine]
affects: [campaign-workspace, performance-snapshots]
tech-stack:
  added: [creative_hypotheses, hypothesis_variants, variant_comparisons tables]
  patterns: [deterministic verdict engine, comparability gates]
key-files:
  created:
    - app/drizzle/0039_creative_hypotheses.sql
    - app/src/server/performance/hypothesis/types.ts
    - app/src/server/performance/hypothesis/comparability.ts
    - app/src/server/performance/hypothesis/compare.ts
    - app/src/server/performance/hypothesis/aggregate.ts
  modified:
    - app/src/server/db/schema.ts
decisions:
  - "Verdicts are deterministic with 1000-impression floor and 5% relative gap for winner"
  - "Campaign objective required as minimum comparability context"
metrics:
  duration: "~45m"
  completed: "2026-06-12"
---

# Phase 105 Plan 01: Schema and Comparison Engine Summary

**One-liner:** Normalized hypothesis tables plus deterministic comparability engine with four honest verdict states.

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED
