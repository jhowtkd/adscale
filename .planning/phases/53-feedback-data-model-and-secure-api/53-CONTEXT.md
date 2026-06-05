# Phase 53: Feedback Data Model and Secure API - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** Autonomous discuss (--auto) + live repo inspection

<domain>
## Phase Boundary

Create the durable feedback report data model, Drizzle migration, repository layer, and authenticated create API with workspace isolation, entity reference validation, and diagnostic payload sanitization. UI, Sentry correlation, and owner triage are later phases.
</domain>

<decisions>
## Implementation Decisions

### Data model
- Locked: Single `feedback_reports` table in `adscale_app` schema with status, type, severity, category, message, followUpAllowed, route, contextKind, workspaceId, userId, campaignId, derivationId (nullable FKs), diagnosticContext (jsonb), sentryCorrelation (jsonb), contextCompleteness (jsonb), timestamps.
- Locked: Status values: `new`, `reviewing`, `resolved`, `archived`.
- Locked: Type values: `bug`, `suggestion`, `question`, `other`.
- Locked: Severity values: `low`, `medium`, `high`, `critical`.
- Locked: Asset references stored as normalized jsonb array on the report (`assetRefs`) with `{ kind, id, key? }` — no duplicate file storage.
- Locked: Internal owner notes and resolution summary columns exist on the table but are only writable via owner APIs in phase 55.

### API surface (this phase)
- Locked: `POST /api/feedback/reports` — create only in this phase.
- Locked: `PATCH /api/feedback/reports/[id]` — status/notes reserved for phase 55; do not expose to beta users in this phase.
- Locked: Use `requireWorkspaceAccess` for auth; reject if session/workspace missing.
- Locked: Server validates optional `campaignId`, `derivationId`, and each `assetRefs[]` entry belongs to the active workspace before insert.

### Diagnostic sanitization
- Locked: Max message length 4000 chars; max diagnostic JSON 32 KB after normalization.
- Locked: Strip keys matching `/token|password|secret|authorization|cookie|prompt/i` and truncate long string values (>500 chars).
- Locked: Exclude raw request bodies, full prompts, auth headers, and unrelated workspace entity IDs.
- Locked: Breadcrumb array capped at 20 entries, each entry capped at 1 KB serialized.

### Observability (server)
- Locked: Log report creation and validation failures with `reportId`, `workspaceId`, `userId`, `requestId` only — no message or diagnostic body in logs.
- Locked: Reuse existing structured logger patterns from the app.

### Claude's Discretion
- Exact Zod schema field names and category enum list (suggest: `ui`, `generation`, `billing`, `performance`, `other`).
- Repository file layout (`server/repositories/feedback.ts`).
- Migration numbering under `app/drizzle/`.
- Unit vs integration test split.

</decisions>

<specifics>
## Specific Ideas

- Follow existing Drizzle patterns in `app/src/server/db/schema.ts` and repository style in `server/repositories/*`.
- Follow API error handling via `apiError` / `handleApiError` from `@/lib/api-response`.
- `verifyMembership` and entity-scoped queries already exist for workspace isolation.
- Sentry is initialized in `app/src/instrumentation.ts`; correlation fields stored as jsonb for phase 54 to populate.
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireWorkspaceAccess`, `requireRole`, `verifyMembership` — auth/workspace gates.
- Drizzle `pgSchema("adscale_app")` — all app tables.
- `apiFetch` / route handler patterns under `app/src/app/api/**/route.ts`.
- Campaigns, derivations, campaign_assets tables for FK validation.

### Established Patterns
- Zod validation at API boundary.
- Repository functions for workspace-scoped CRUD.
- `npm run db:migrate` + drizzle-kit for migrations.
- Vitest tests colocated or under `app/tests/`.

### Integration Points
- New table + migration in schema layer.
- New API route under `app/src/app/api/feedback/reports/`.
- Phase 54 will call create API from client; phase 55 will add list/detail/patch for platform owner.

</code_context>

<deferred>
## Deferred Ideas

- Feedback modal UI — Phase 54.
- Sentry client correlation tags — Phase 54.
- Owner triage list/detail — Phase 55.
- Browser smoke and privacy audit doc — Phase 56.
- Email notifications on new reports — backlog (FBK-FUT-02).

</deferred>

---

*Phase: 53-feedback-data-model-and-secure-api*
*Context gathered: 2026-06-05 via autonomous discuss*
