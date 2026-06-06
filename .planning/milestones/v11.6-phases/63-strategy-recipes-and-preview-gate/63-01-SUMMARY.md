---
phase: 63-strategy-recipes-and-preview-gate
plan: "01"
subsystem: strategy-recipes
tags: [recipes, credits, generation-config]
requires: [61-creative-readiness, 62-guided-briefing]
provides: [strategy-recipes-module, credit-estimation]
affects: [derivations, campaign-workspace]
tech-stack:
  added: []
  patterns: [recipe-to-config-mapping, context-ranked-suggestions]
key-files:
  created:
    - app/src/server/ai/strategy-recipes.ts
    - app/src/server/ai/strategy-recipes.test.ts
decisions:
  - Client-safe credit constant duplicated to avoid pulling pg into client bundle.
metrics:
  duration: "~15m"
  completed: "2026-06-05"
---

# Phase 63 Plan 01: Strategy Recipe Contract Summary

**One-liner:** Three strategy recipes with readiness-aware ranking, generation config mapping, and batch/preview credit estimation.

## What Shipped

- `strategy-recipes.ts` — Safe Iteration, Performance Push, Visual Differentiation catalog.
- `rankRecipesForContext` uses readiness dimensions, brand kit, and campaign CTAs.
- `mapRecipeToGenerationConfig` with override support and `toCampaignPatch` helper.
- `countDerivationJobs` / `estimateCreditCost` mirror derivations route job counting.

## Requirements

| ID | Status |
|----|--------|
| RECIPE-01 | Covered |
| RECIPE-02 | Covered |
| RECIPE-03 | Covered (tradeoff keys for i18n) |
| RECIPE-04 | Covered |
| RECIPE-05 | Covered (override merge) |
| PREVIEW-04 | Partial (estimation only; UI in 63-02) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoid server billing import in client-imported module**
- **Found during:** Task 1 / 63-02 build
- **Issue:** `CREDIT_COSTS` import pulled `pg` into client bundle via StrategyRecipePanel.
- **Fix:** Use `IMAGE_DERIVATION_CREDIT_COST` constant in strategy-recipes.ts.
- **Files modified:** `app/src/server/ai/strategy-recipes.ts`
- **Commit:** 50804a6

## Self-Check: PASSED

- `app/src/server/ai/strategy-recipes.ts` — FOUND
- Commit 2a59fe6 — FOUND
- Tests 10/10 — PASSED
