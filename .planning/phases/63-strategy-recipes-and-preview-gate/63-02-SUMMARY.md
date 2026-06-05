---
phase: 63-strategy-recipes-and-preview-gate
plan: "02"
subsystem: strategy-recipes-ui
tags: [workspace, preview-gate, i18n]
requires: [63-01]
provides: [StrategyRecipePanel, PreviewGatePanel, preview-first-flow]
affects: [campaigns/[id]/page, use-campaign-workspace]
tech-stack:
  added: []
  patterns: [preview-before-batch, recipe-overrides]
key-files:
  created:
    - app/src/components/workspace/StrategyRecipePanel.tsx
    - app/src/components/workspace/PreviewGatePanel.tsx
    - app/src/lib/hooks/use-strategy-recipe.ts
  modified:
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
    - app/src/lib/hooks/use-campaign-workspace.ts
    - app/src/lib/hooks/use-derivation-flow.ts
    - app/messages/en.json
    - app/messages/pt-BR.json
decisions:
  - Derivar opens strategy recipe panel by default; legacy chooser via advanced link.
  - Preview gate shows until first non-preview derivation is queued.
metrics:
  duration: "~25m"
  completed: "2026-06-05"
---

# Phase 63 Plan 02: Strategy Recipe UI and Preview Gate Summary

**One-liner:** Recipe picker with overrides, preview-first generation, and batch credit gate before full queue.

## What Shipped

- `StrategyRecipePanel` — three recipes, recommended badge, creative level / CTA / mode overrides, credit preview.
- `PreviewGatePanel` — completed preview summary, spent + batch credits, approve batch / revise recipe.
- `useStrategyRecipe` hook for selection, overrides, and estimates.
- Workspace: `configureAndGenerate({ preview })`, `showPreviewGate`, `approvePreviewToBatch`.
- `strategyRecipes` i18n namespace (EN + PT-BR).

## Requirements

| ID | Status |
|----|--------|
| RECIPE-01..05 | Covered |
| PREVIEW-01 | Covered (preview POST path) |
| PREVIEW-02 | Covered (same derivation job pipeline) |
| PREVIEW-03 | Covered (approve / revise actions) |
| PREVIEW-04 | Covered (credit display in panel and recipe modal) |

## Deviations from Plan

None beyond 63-01 credit import fix included in this commit.

## Self-Check: PASSED

- `StrategyRecipePanel.tsx` — FOUND
- `PreviewGatePanel.tsx` — FOUND
- Commit 50804a6 — FOUND
- Tests 15/15 focused — PASSED
- Build — PASSED
- Lint — 0 errors
