# Phase 190: Guided Journey Telemetry - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto (recommended defaults selected)

<domain>
## Phase Boundary

Capture safe, structured lifecycle events for both guided assistant journeys. This phase delivers the event model, repository/query layer, sanitizer and server-side instrumentation — not the owner funnel UI (Phase 191), staging runbook (Phase 192), human quality feedback (Phase 193), or release gate (Phase 194).

</domain>

<decisions>
## Implementation Decisions

### Storage model
- Dedicated `assistant_guided_flow_events` table (TEL-01), separate from `beta_analytics_events`
- Events are append-only; no client ingest endpoint in this phase
- Denormalize `workspace_id`, `client_profile_id`, `thread_id`, `path`, `step` on each event row for scoped queries

### Event contract (TEL-01, TEL-02)
- Event keys: `guided_flow_started`, `guided_step_viewed`, `guided_input_supplied`, `guided_action_blocked`, `guided_action_proposed`, `guided_action_confirmed`, `guided_action_failed`, `guided_flow_completed`
- Blocker categories: `missing_asset`, `missing_references`, `missing_brief_fields`, `action_failure`, `validation_error`, `provider_failure`, `unknown`
- Paths: `existing_creative` | `from_zero` (exclude `unclassified` from funnel-oriented queries where path matters)

### Safe metadata (TEL-03)
- Allowed metadata keys only: counts, booleans, short reason codes, safe action type, status and ids already in explicit columns
- Reuse `PERSISTENCE_DENYLIST` / `containsDeniedPersistenceKeys` behavior — strip or reject denied keys before insert
- Never persist provider reasoning, signed URLs, raw tool args, prompts or model messages

### Instrumentation scope
- Server-side only in existing guided-flow routes (`route.ts`, `select-creative`, `from-zero`)
- Record start, step views, input supplied, blockers and completion from route handlers after successful mutations
- Telemetry failures log to server but never block the user journey

### Query layer (TEL-04)
- Repository list helper filters by workspace, optional clientProfile, thread, path, step, eventKey and time window
- Cross-workspace/client/thread isolation enforced at repository boundary (mirror `guided-flow.ts` pattern)

### Migration
- Drizzle migration `0059_assistant_guided_flow_events.sql` registered in journal after `0058_assistant_guided_flow`

### Claude's Discretion
- Exact allowed metadata key allowlist (mirror beta-analytics strict object pattern)
- Index naming following existing Drizzle conventions
- Whether `occurred_at` defaults to `now()` or accepts caller override (recommend default now with optional override)
- Test organization: repository tests + sanitizer tests + route instrumentation tests

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assistant_guided_flows` table and `guided-flow.ts` repository — scope validation pattern
- `beta-analytics/sanitize.ts` and `record.ts` — event allowlist and safe JSON pattern
- `assistant-types.ts` — `PERSISTENCE_DENYLIST`, `containsDeniedPersistenceKeys`
- Guided-flow routes under `app/src/app/api/assistant/threads/[threadId]/guided-flow/`

### Established Patterns
- Drizzle schema in `schema.ts`, migrations in `app/drizzle/`
- Repository layer with typed validation errors
- Route tests co-located as `route.test.ts`
- Fire-and-forget analytics must not block UI or API responses

</code_context>

<deferred>
## Deferred Ideas

- Owner funnel dashboard UI — Phase 191
- Client-side telemetry ingest endpoint — out of scope; server instrumentation only
- Action proposal/confirm telemetry from orchestrator — instrument only where guided-flow routes have safe context in this phase

</deferred>

---

*Phase: 190-guided-journey-telemetry*
*Context gathered: 2026-06-26 via Auto mode*
