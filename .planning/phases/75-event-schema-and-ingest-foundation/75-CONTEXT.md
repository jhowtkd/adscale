# Phase 75: Event Schema and Ingest Foundation - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the durable first-party analytics event layer and PII-safe ingest API for v11.8. This phase delivers schema, migration, repository, sanitization, and `POST` ingest — not cockpit instrumentation hooks (Phase 76), operator session UI (Phase 77), or owner funnel dashboard (Phase 78).

Requirements in scope: **INST-01**, **INST-05**, **INST-06**.

</domain>

<decisions>
## Implementation Decisions

### Event table naming
- Locked: Primary table name is **`beta_analytics_events`** (not `product_events`).
- Locked: Append-only event store; workspace-scoped; queryable by `workspace_id`, `event_key`, `session_id`, and `created_at`.

### `beta_sessions` in Phase 75
- Locked: Create **`beta_sessions`** with minimal schema in this phase (migration + Drizzle model only).
- Rationale: User chose nullable `session_id` FK on events; table must exist before ingest accepts `session_id`.
- Minimal columns: `id`, `workspace_id`, `cohort_label` (nullable text), `assistance_level` (enum: `hands_on` | `observe_only`), `started_at`, `ended_at` (nullable), `operator_notes` (jsonb stage-keyed object, optional empty default), timestamps.
- Locked: **No session CRUD APIs in Phase 75** — create/list/end session routes belong to Phase 77. Phase 75 only defines FK target and nullable column on events.

### Relationship to existing event tables
- Locked: **`activity_events` stays parallel** — no migration, no deprecation, no dual-write in this phase.
- Locked: **`usage_events` stays authoritative for credit debits** — do not duplicate credit spend into `beta_analytics_events` in Phase 75. Credit funnel reads `usage_events` in Phase 78.
- Locked: **`feedback_reports` stays qualitative lane** — no merge into analytics events.

### Event ↔ session linkage
- Locked: `beta_analytics_events.session_id` is **nullable FK** → `beta_sessions.id`.
- Locked: Events without an active session are valid (pre-session smoke, server-only events before operator starts session 1).

### PII and sanitization (not discussed — defaults from v11.8 research)
- Locked: **Allowlist-only** `properties` jsonb — reject unknown keys at ingest (stricter than feedback blocklist).
- Locked: No prompts, emails, free-text user content, asset URLs, or auth tokens in properties.
- Locked: Mirror feedback patterns for max payload size and structured logging (IDs only, no property bodies in logs).

### Ingest API (not discussed — research default)
- Locked: `POST /api/analytics/events` with `requireWorkspaceAccess` for member-authenticated client events.
- Locked: Server modules call internal `recordBetaAnalyticsEvent()` directly (no HTTP) for authoritative events in Phase 76+.
- Locked: Ingest failures on client are non-blocking (fire-and-forget); server paths must not silently drop credit/mission events.

### Claude's Discretion
- Exact allowlist key set and Zod schemas per `event_key` family.
- Migration number under `app/drizzle/`.
- Repository file layout (`server/repositories/beta-analytics.ts` or split).
- Whether `campaign_id` / `derivation_id` optional UUID columns exist on events vs only in properties.
- Index strategy beyond `(workspace_id, created_at)` and `(session_id)`.
- Unit vs integration test split for sanitization vs ingest.

</decisions>

<specifics>
## Specific Ideas

- Table name explicitly signals beta-learning scope; may generalize post-v11.8 without rename pressure.
- `assistance_level` on sessions supports pitfalls research on operator bias (hands-on vs observe-only).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `usage_events` — credit debits with `idempotency_key`; read-only reference for later funnel, not written in Phase 75.
- `activity_events` — legacy parallel; leave untouched.
- `feedback_reports` + `app/src/server/feedback/sanitize.ts` — sanitization and workspace validation patterns to mirror.
- `requireWorkspaceAccess` / `requirePlatformOwner` — auth boundaries from feedback APIs.

### Established Patterns
- Drizzle tables in `adscale_app` schema with workspace FK + cascade delete.
- Repository layer under `app/src/server/repositories/`.
- Zod validation at API route boundary.

### Integration Points
- Phase 76 hooks call internal `recordBetaAnalyticsEvent()` after this phase lands.
- Phase 77 adds session CRUD on `beta_sessions` table created here.
- Phase 78 aggregates `beta_analytics_events` + `usage_events` for credit surprise signals.

</code_context>

<deferred>
## Deferred Ideas

- Migrating or aliasing `activity_events` → future cleanup, not v11.8.
- Owner funnel queries and CSV export → Phase 78.
- Cockpit/mission instrumentation hooks → Phase 76.
- `readiness_overridden` distinct event type → decide in Phase 76 instrumentation spec.

</deferred>

---

*Phase: 75-event-schema-and-ingest-foundation*
*Context gathered: 2026-06-07*
