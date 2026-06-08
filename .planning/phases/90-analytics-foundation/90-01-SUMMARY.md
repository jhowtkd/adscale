---
phase: 90
plan: 01
subsystem: beta-analytics
tags: [share, stall, readiness, aggregates]
requires: [v11.8 analytics foundation]
provides: [share_link_opened, approval_package_refreshed, blockingDimensions, aggregate functions]
affects: [OwnerAnalyticsPanel, funnel API]
key-files:
  modified:
    - app/src/server/beta-analytics/types.ts
    - app/src/server/beta-analytics/aggregate.ts
    - app/src/server/beta-analytics/aggregate.test.ts
    - app/src/server/beta-analytics/sanitize.test.ts
  added:
    - app/src/server/beta-analytics/share-analytics.ts
    - app/src/server/repositories/workspace.ts
metrics:
  completed: 2026-06-08
---

# Phase 90 Plan 01: Analytics Foundation Summary

**One-liner:** Extended beta analytics allowlist and aggregate layer for share opens, readiness overrides by dimension, post-preview stalls, draft→share timing, and share engagement by assistance.

## Requirements

- READY-08 — override dimension aggregation
- LEARN-06 — funnel summary extensions for learning closure inputs

## Self-Check: PASSED
