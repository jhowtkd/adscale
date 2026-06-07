# Phase 76: Cockpit and Mission Instrumentation - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — recommended defaults accepted)

<domain>
## Phase Boundary

Wire authoritative server and client beta analytics events across cockpit stages, missions, and credit boundaries using Phase 75 `recordBetaAnalyticsEvent()` and `POST /api/analytics/events`. Deliver instrumentation hooks and integration tests — not operator session UI (Phase 77), owner dashboard (Phase 78), or friction fixes (Phase 79).

Requirements in scope: **INST-02**, **INST-03**, **INST-04**, **QA-01**.

</domain>

<decisions>
## Implementation Decisions

### Event taxonomy
- Locked: Use **`event_key` snake_case** on `beta_analytics_events` (Phase 75 schema); no separate `event_type` column.
- Locked: Closed enum in `types.ts` for Phase 76 keys:
  - Server: `readiness_blocked`, `readiness_completed`, `credit_spend`, `credit_blocked`, `mission_completed`
  - Client: `cockpit_stage_entered`, `cockpit_stage_completed`, `cockpit_stage_abandoned`
- Locked: `properties.stage` and `properties.missionKey` use existing `MissionKey` / runbook stage names from `MISSION_ORDER`.

### Server instrumentation (INST-02)
- Locked: **`preflight` POST** emits `readiness_blocked` or `readiness_completed` with `blockingCount`, `readinessStatus`.
- Locked: **`recordUsage` success path** in `credits.ts` emits `credit_spend` with `actualCredits`, `operation`, `estimateCredits` when available in metadata.
- Locked: **Billing gate rejection** (`spendCreditsOrApiError` / blocked `recordUsage`) emits `credit_blocked` with `reasonCode`, `operation`, `estimateCredits`.
- Locked: **Mission completion** — after `inferMissionCompletions` detects new completion in progression refresh path OR explicit hook when mission status transitions to `completed` in `getWorkspaceMissions` is too heavy; prefer hook at durable evidence write boundaries (export, share, derivation approve) emitting `mission_completed` with `missionKey`.
- Locked: Server events use `source: 'server'` via `recordBetaAnalyticsEvent`.

### Client instrumentation (INST-03)
- Locked: **`useRecordBetaEvent` hook** — fire-and-forget `fetch('/api/analytics/events')`; swallow errors; no blocking UI.
- Locked: Panels emit on mount/open (`cockpit_stage_entered`) and on explicit complete/abandon:
  - `CreativeReadinessPanel`, `GuidedBriefingPanel`, `StrategyRecipePanel`, `PreviewGatePanel`
- Locked: Abandon = user closes/leaves stage without success signal (panel unmount without complete flag, cancel button).
- Locked: Client events use default `source: 'client'`.

### Session grouping (INST-04)
- Locked: Optional `sessionId` on client events read from **`sessionStorage` key `adscale_beta_session_id`** when set (Phase 77 will populate; Phase 76 reads if present).
- Locked: Server events accept optional `sessionId` from request header `x-beta-session-id` when operator tooling sets it later; no session CRUD in this phase.
- Locked: Smoke test inserts a fixture `beta_sessions` row and verifies events attach `session_id`.

### Allowlist extension
- Locked: Extend `ALLOWED_PROPERTY_KEYS` only as needed for new instrumentation fields; keep scalar-only.
- Locked: Validate `event_key` against closed enum at `recordBetaAnalyticsEvent` for Phase 76 keys (reject unknown keys server-side).

### Claude's Discretion
- Exact file for `useRecordBetaEvent` (`lib/hooks/` vs `lib/beta-analytics/`).
- Whether `mission_completed` fires from single aggregation point vs multiple evidence hooks.
- Integration test file layout (`beta-analytics/instrumentation.integration.test.ts` vs route-level tests).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recordBetaAnalyticsEvent()` — Phase 75 single write path
- `POST /api/analytics/events` — client ingest
- `ALLOWED_PROPERTY_KEYS` in `server/beta-analytics/types.ts`
- `MissionInsightProvider` / mission insights — parallel qualitative lane; do not merge
- `spendCreditsOrApiError`, `recordUsage` in `server/billing/credits.ts`
- Cockpit panels: `CreativeReadinessPanel`, `GuidedBriefingPanel`, `StrategyRecipePanel`, `PreviewGatePanel`
- `preflight/route.ts` POST for readiness

### Established Patterns
- Server instrumentation at API route boundary after validation
- Client fire-and-forget fetch (mission insights precedent)
- Vitest route tests with mocked auth

### Integration Points
- Phase 77 sets `sessionStorage` / operator session header
- Phase 78 aggregates `beta_analytics_events` for funnel

</code_context>

<specifics>
## Specific Ideas

- Follow ARCHITECTURE.md cockpit ↔ mission key mapping table for `properties.missionKey`.
- Instrumentation smoke: scripted test proves ≥1 server event (`readiness_blocked` or `readiness_completed`) and ≥1 client event path before operator session 1.

</specifics>

<deferred>
## Deferred Ideas

- Owner funnel aggregation → Phase 78
- Session start/end APIs → Phase 77
- `readiness_overridden` distinct event → optional in Phase 78 if owner override UI ships
- Idempotency keys for duplicate client events → backlog if smoke shows duplicates

</deferred>

---

*Phase: 76-cockpit-and-mission-instrumentation*
*Context gathered: 2026-06-07 via autonomous smart discuss*
