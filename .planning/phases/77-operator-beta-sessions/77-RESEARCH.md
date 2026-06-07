# Phase 77 — Operator Beta Sessions Research

**Date:** 2026-06-07  
**Status:** Complete (Level 0 — established patterns)

## Standard Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| DB | Existing `beta_sessions` (Phase 75) | DDL + FK already migrated |
| Repository | New `beta-sessions.ts` | Session CRUD separate from event ingest (`beta-analytics.ts`) |
| API auth | `requirePlatformOwner` | Matches `/api/feedback/reports` triage surface |
| Validation | Zod at route boundary | Repo convention |
| UI | Extend `/feedback` page | CONTEXT D: no new top-level route |
| Client session link | `sessionStorage` key `adscale_beta_session_id` | Phase 76 hook already reads this key |

## Architecture Patterns

- Routes under `/api/feedback/beta-sessions` (owner-only sibling to reports APIs).
- `operator_notes` jsonb merged per stage key — never full-replace unrelated stages.
- Runbook stage keys from `67-BETA-RUNBOOK.md`: `setup`, `readiness`, `guided_briefing`, `strategy_recipe`, `preview`, `batch`, `review`, `export`, `share`.
- `assistance_level`: `hands_on` | `observe_only` (text + Zod; default `hands_on`).
- Summary export aggregates session row + stage completion + linked `beta_analytics_events` IDs.

## Don't Hand-Roll

- Session ID validation on ingest — Phase 75 `recordBetaAnalyticsEvent` already validates FK scope.
- New analytics ingest — reuse Phase 76 client hook; Phase 77 only sets `sessionStorage`.

## Common Pitfalls

| Pitfall | Mitigation |
|---------|------------|
| Replacing entire `operator_notes` on PATCH | Deep-merge only provided stage keys |
| Missing sessionStorage on start | UI must set key immediately after POST success |
| SESS-03 interpreted as 3 prod sessions in code | Template + fixture test; UAT marked `human_needed` |
| Cross-workspace session injection | Validate `workspace_id` exists on create; notes/end scoped by session id |

## Out of Scope

- External cohort automation, multi-operator concurrent sessions, session replay (deferred in CONTEXT).

## Architectural Responsibility Map

| Concern | Owner module |
|---------|--------------|
| Session CRUD + notes | `repositories/beta-sessions.ts` |
| Stage types + runbook enum | `server/beta-sessions/types.ts` |
| Owner HTTP surface | `app/api/feedback/beta-sessions/**` |
| Operator UI | `components/feedback/BetaSessionsPanel.tsx` |
| Client event attachment | Phase 76 `use-record-beta-event` (read-only consumer) |
