# Phase 77: Operator Beta Sessions - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — recommended defaults accepted)

<domain>
## Phase Boundary

Deliver operator-facing beta session lifecycle (start/end, structured per-stage notes) on existing `beta_sessions` table from Phase 75. Enable 3–5 operator-run sessions per `67-BETA-RUNBOOK.md` with durable artifacts — not owner analytics dashboard (Phase 78) or friction fixes (Phase 79).

Requirements: **SESS-01**, **SESS-02**, **SESS-03**, **SESS-04**.

</domain>

<decisions>
## Implementation Decisions

### Auth and audience
- Locked: Session APIs are **platform-owner / operator only** via `requirePlatformOwner` (same as `/feedback` triage).
- Locked: Operator selects **target workspace** when starting a session (`workspace_id` on `beta_sessions`).

### Session CRUD (SESS-01)
- Locked: Routes under **`/api/feedback/beta-sessions`**:
  - `POST` start session (workspaceId, cohortLabel?, assistanceLevel)
  - `PATCH` end session (sessionId, endedAt)
  - `GET` list sessions (filters: workspaceId, active only)
  - `GET` single session by id
- Locked: On start, set `sessionStorage` key `adscale_beta_session_id` in operator UI so Phase 76 client events attach `session_id`.

### Structured notes (SESS-02)
- Locked: Store notes in existing **`operator_notes` jsonb** on `beta_sessions` — keys match runbook stages from `67-BETA-RUNBOOK.md`:
  - `setup`, `readiness`, `guided_briefing`, `strategy_recipe`, `preview`, `batch`, `review`, `export`, `share`
- Locked: Each stage note shape: `{ notes?: string, tags?: string[], completedAt?: string, blockerIds?: string[] }`
- Locked: `PATCH /api/feedback/beta-sessions/[id]/notes` merges stage-keyed updates (no full replace of unrelated stages).

### Operator UI
- Locked: Extend **`/feedback` page** with "Beta Sessions" panel (operator-only) — not a new top-level route.
- Locked: Session runner shows runbook checklist with per-stage note form + "mark complete" toggle.
- Locked: Display workspace ID, session ID, started/ended timestamps, link to copy IDs for artifacts.

### Artifacts (SESS-03, SESS-04)
- Locked: Generate **`77-SESSION-ARTIFACTS.md`** template in phase dir; operator fills during real sessions (human step for SESS-03 count).
- Locked: Session summary JSON export via `GET /api/feedback/beta-sessions/[id]/summary` for Phase 78 dashboard input.
- Locked: Code delivers capability + one **documented example fixture session** in tests — not 3 real production sessions (SESS-03 is UAT/operator evidence, marked human_needed in verification).

### Claude's Discretion
- Repository split (`beta-sessions.ts` vs extend `beta-analytics.ts`).
- Whether assistance_level defaults to `hands_on`.
- i18n: operator UI may stay EN-only for beta tooling.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `beta_sessions` table + `getBetaSessionById` from Phase 75
- `/feedback` page and `requirePlatformOwner` pattern
- `67-BETA-RUNBOOK.md` stage names
- Phase 76 `sessionStorage` / `x-beta-session-id` session attachment

### Established Patterns
- Feedback owner APIs under `/api/feedback/*`
- Zod validation at route boundary
- TanStack Query hooks for dashboard widgets

</code_context>

<specifics>
## Specific Ideas

- Runbook reference: `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md`
- Link session notes to `feedback_reports` IDs when operator files feedback during session (optional `feedbackReportId` in stage note).

</specifics>

<deferred>
## Deferred Ideas

- External beta cohort automation
- Multi-operator concurrent sessions per workspace
- Session replay / RRWeb

</deferred>

---

*Phase: 77-operator-beta-sessions*
