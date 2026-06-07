---
phase: 78-owner-analytics-dashboard-and-csv
plan: 01
subsystem: beta-analytics
tags: [aggregation, funnel, owner-dashboard]
requires: [phase-75, phase-76]
provides: [analytics-aggregate, owner-event-listing]
key-files:
  created:
    - app/src/server/beta-analytics/aggregate.ts
    - app/src/server/beta-analytics/aggregate.fixture.ts
    - app/src/server/beta-analytics/aggregate.test.ts
  modified:
    - app/src/server/repositories/beta-analytics.ts
decisions:
  - "Mission funnel uses cockpit_stage_entered as started proxy per Phase 76 event keys"
  - "Readiness overrides merge readiness_blocked events with operator note false-positive tags"
metrics:
  duration: 15m
  completed: 2026-06-07
---

# Phase 78 Plan 01: Aggregation Layer Summary

Owner-scoped beta analytics aggregation with mission funnel, cockpit stage funnel, credit surprises, and readiness override signals.

## Deviations

None — plan executed as written.

## Self-Check: PASSED
