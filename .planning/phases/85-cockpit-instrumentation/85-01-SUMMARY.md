---
phase: 85
plan: 01
subsystem: beta-analytics
tags: [cockpit, instrumentation, recipe-funnel]
requires: [v11.8 analytics foundation]
provides: [recipe events, briefing step abandon, preview funnel fix]
affects: [OwnerAnalyticsPanel, StrategyRecipePanel, GuidedBriefingPanel, PreviewGatePanel]
tech-stack:
  added: [recipe_selected, recipe_tradeoff_viewed event keys]
  patterns: [useRecordBetaEvent fire-and-forget]
key-files:
  modified:
    - app/src/server/beta-analytics/types.ts
    - app/src/server/beta-analytics/aggregate.ts
    - app/src/components/workspace/StrategyRecipePanel.tsx
    - app/src/components/workspace/GuidedBriefingPanel.tsx
    - app/src/components/workspace/PreviewGatePanel.tsx
    - app/src/components/feedback/OwnerAnalyticsPanel.tsx
decisions:
  - Extended closed event enum before adding call sites
  - Preview revise no longer emits false abandonment
metrics:
  duration: 45m
  completed: 2026-06-07
---

# Phase 85 Plan 01: Cockpit Instrumentation Summary

**One-liner:** Recipe and briefing cockpit events with owner funnel aggregations and preview revise false-abandon fix.

## Deviations from Plan

None — implemented per ROADMAP success criteria.

## Self-Check: PASSED
