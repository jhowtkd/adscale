# Research Summary: v11.8 Beta Learning Loop

**Synthesized:** 2026-06-07  
**Milestone:** v11.8 Loop de Aprendizado Beta  
**Confidence:** HIGH

## Executive Summary

v11.8 should **not** add third-party analytics or new AI behavior. Extend the existing Drizzle + owner `/feedback` stack with first-party `product_events` and `beta_sessions` tables, instrument cockpit/mission/credit boundaries, run 3–5 operator sessions, then ship up to 5 evidence-driven friction fixes and a learning-questions answer doc.

## Stack additions

- **No new npm dependencies required** for operator-scale scope
- **PostgreSQL tables:** `product_events` (append-only), `beta_sessions` (operator notes)
- **APIs:** event ingest, funnel aggregation, CSV export — all `requirePlatformOwner` for reads
- **Avoid:** Mixpanel/PostHog, session replay, real-time dashboards

## Feature table stakes

1. Event taxonomy covering cockpit stages, missions, credits, readiness blocks
2. Operator session log tied to `67-BETA-RUNBOOK.md`
3. Owner funnel on `/feedback` + CSV export
4. Evidence rubric before friction fixes (≤5)
5. Written answers to v11.6 learning questions from ≥3 sessions

## Architecture build order

1. Schema + sanitize + ingest (Phase 75)
2. Server + client instrumentation hooks (Phase 76)
3. Operator sessions + notes (Phase 77)
4. Owner dashboard + CSV + learning template (Phase 78)
5. Evidence-ranked friction fixes + verification (Phase 79)

## Cross-research consensus (4 agents)

- **Measurement gap, not product gap** — v11.7 ships missions, insights, and triage; v11.8 adds stage-level funnel data the learning questions require.
- **Two lanes of truth** — quantitative events (`product_events`) separate from qualitative `feedback_reports` / mission insights; never merge into one “health” score.
- **Reuse before adding** — `usage_events` for credit debits, `workspace_progression` for completion ground truth, `recharts` + TanStack Query on `/feedback`; inference alone cannot measure abandonment.
- **Operator bias** — capture `session_id` and `assistance_level` (hands-on vs observe) so guided sessions don't inflate conversion.
- **Critical path** — instrument → dashboard/export → ≥3 sessions → learning answers → ≤5 evidence fixes.

## Open questions (discuss in Phase 75)

- Table name: `product_events` vs `beta_analytics_events` (same shape; pick one in schema phase).
- Cohort tagging: workspace metadata vs `beta_sessions.cohortLabel` only.
- `readiness_overridden` as distinct event for Q1 false-positive analysis.

## Watch out for

- Starting beta sessions before events exist in production DB
- PII in event properties (prompts, brief text, emails)
- Friction fixes that are secretly new features or AI changes
- Cross-workspace analytics without owner gate
- Answering learning questions from operator memory instead of funnel data

## Recommended phase count

**5 phases (75–79)** — instrumentation → sessions → dashboard → fixes → verification

## Key integration points

| Existing | v11.8 touch |
|----------|-------------|
| `/feedback` owner triage | Add analytics/funnel tab |
| Mission service | `mission_completed` events |
| Readiness/preview/credit APIs | Authoritative spend/block events |
| `67-LEARNING-QUESTIONS.md` | Output: `78-LEARNING-ANSWERS.md` |

---
*Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
