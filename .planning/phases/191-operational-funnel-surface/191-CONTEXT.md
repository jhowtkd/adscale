# Phase 191: Operational Funnel Surface - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto (recommended defaults selected)

<decisions>
## Implementation Decisions

- Extend owner analytics with dedicated `/api/feedback/analytics/guided-flow-funnel` endpoint
- Reuse `parseOwnerAnalyticsQuery` filters (workspace, date range)
- Aggregate Phase 190 telemetry events server-side; no client-side funnel math
- Separate `implementationCoverage` from `operationalEvidence.sampleSufficient` (min 5 starts)
- Investigation output exposes thread/workspace/client ids only — no metadata payloads
- Surface in existing `OwnerAnalyticsPanel` under core funnels group
</decisions>
