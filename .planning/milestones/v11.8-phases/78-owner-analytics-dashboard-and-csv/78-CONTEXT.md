# Phase 78: Owner Analytics Dashboard and CSV - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous)

<domain>
## Phase Boundary

Owner-only funnel analytics on `/feedback`: mission conversion, cockpit stage funnel, credit surprise, readiness override signals, CSV export. Uses `beta_analytics_events`, `usage_events`, `beta_sessions`. Not friction fixes (Phase 79).

Requirements: **DASH-01** through **DASH-05**, **LEARN-01**, **LEARN-02**, **QA-02**.

</domain>

<decisions>
## Implementation Decisions

### API surface
- Locked: Routes under `/api/feedback/analytics/`:
  - `GET funnel` — mission + cockpit stage counts (started/completed/abandoned)
  - `GET credit-signals` — extend existing mission-credit-signals with event-based `credit_blocked` / estimate vs actual from `usage_events`
  - `GET export.csv` — same filters as funnel (workspaceId, sessionId, date range)
- Locked: All routes use **`requirePlatformOwner`**; non-owner → 403 (QA-02).

### UI
- Locked: Extend `/feedback` page with analytics cards above triage list.
- Locked: Filters: date range, optional workspaceId, optional sessionId (from beta sessions list).
- Locked: CSV download button calls export route with current filters.

### Aggregation
- Locked: Funnel math in `server/beta-analytics/aggregate.ts` — query `listBetaAnalyticsEvents` + group by `event_key` / `properties.missionKey`.
- Locked: Mission conversion: `mission_completed` / cockpit entered per `missionKey`.
- Locked: Credit surprise: join `usage_events` actual vs `credit_spend` event `estimateCredits` when both exist.

### Learning doc
- Locked: Create **`78-LEARNING-ANSWERS-DRAFT.md`** with all 10 questions from `67-LEARNING-QUESTIONS.md` — cite event counts / session IDs from fixture or test data; mark sections needing real session data as TBD for operator UAT.

### Claude's Discretion
- Chart vs table-only UI (prefer compact tables for beta).
- Readiness override signal UI if no override events yet — show empty state.

</decisions>

<deferred>
## Deferred Ideas

- Real-time WebSocket dashboard
- Third-party BI export

</deferred>

---

*Phase: 78-owner-analytics-dashboard-and-csv*
