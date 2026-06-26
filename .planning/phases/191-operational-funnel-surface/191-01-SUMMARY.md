---
phase: 191-operational-funnel-surface
plan: 01
subsystem: api
tags: [funnel, analytics, guided-flow, owner]
requirements-completed: [FUN-01, FUN-02, FUN-03, FUN-04]
completed: 2026-06-26
---

# Phase 191: Operational Funnel Surface Summary

**Owner guided-journey funnel API and analytics panel with sample sufficiency guardrails.**

## Accomplishments

- `buildGuidedFlowFunnelSummary` aggregates path funnel, step drop-off, blockers and investigation links.
- Owner route `GET /api/feedback/analytics/guided-flow-funnel` with platform-owner auth.
- `OwnerAnalyticsPanel` sections for path funnel, drop-off, blockers and thread investigation ids.
- Operational evidence note when sample below threshold (5 starts).

## Verification

- 3 unit/route tests passed for funnel aggregate and API.

## Deviations from Plan

None.

## Self-Check: PASSED
