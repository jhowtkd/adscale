---
phase: 78-owner-analytics-dashboard-and-csv
plan: 02
subsystem: api
tags: [analytics-api, csv-export, qa-02]
requires: [78-01]
provides: [analytics-funnel-api, analytics-credit-api, analytics-export-api]
key-files:
  created:
    - app/src/app/api/feedback/analytics/funnel/route.ts
    - app/src/app/api/feedback/analytics/credit-signals/route.ts
    - app/src/app/api/feedback/analytics/export.csv/route.ts
    - app/src/server/beta-analytics/query.ts
    - app/src/server/beta-analytics/credit-signals.ts
decisions:
  - "Credit signals API merges feedback mission insights with event-based credit_blocked/surprises"
metrics:
  duration: 10m
  completed: 2026-06-07
---

# Phase 78 Plan 02: Analytics API Routes Summary

Three owner-only analytics routes under `/api/feedback/analytics/` with 403 tests for QA-02.

## Deviations

None.

## Self-Check: PASSED
