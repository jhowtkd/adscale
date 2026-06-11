---
gsd_state_version: 1.0
milestone: v11.11
milestone_name: Aprendizado → Ação
status: Defining requirements
stopped_at: Requirements scoping for v12.0
last_updated: "2026-06-11T14:10:00.000Z"
last_activity: 2026-06-11 — Phase 94 complete; v11.11 milestone closed
progress:
  total_phases: 20
  completed_phases: 4
  total_plans: 6
  completed_plans: 17
  percent: 0
---

# State: ADScale

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-08)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Milestone v12.0 Monetização Real — production Stripe billing, beta→paid conversion, subscription lifecycle.

**Parallel track:** v11.11 complete (2026-06-11). All phases 90–96 shipped including Phase 94 learning closure + READY-10 threshold tune.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-11 — Phase 94 complete (learning closure + READY-10)

Progress: ░░░░░░░░░░░░░░░░░░░░ 0%

## Accumulated Context

- Stripe stack exists: checkout (14d trial), portal, webhook (`checkout.session.completed`, subscription sync, `invoice.paid`, `invoice.payment_failed`).
- Plans: starter/growth/scale with monthly credit grants (30/120/360).
- Beta path: code redemption → 10 ads (50 credits), parallel to paid; no fake Stripe subs.
- `getActiveSubscriptionByWorkspace` only treats `active`/`trialing` as paid; `past_due` falls through to beta/none.
- v11.7 upgrade CTAs exist at value moments; need wiring to checkout from 402 surfaces.
- BillingTab has forecast calculator (internal COGS) — keep separate from user-facing credits.

## Session Continuity

Last session: 2026-06-08T18:00:00.000Z
Stopped at: Requirements scoping for v12.0

## Blockers

- None. v11.11 closed; focus on v12.0 Monetização Real.

## SESS-03 follow-ups (UX friction found during real sessions, 2026-06-11)

- Share/approval-package has no UI entry point on campaign page (share created via direct `POST /api/share`) — blocks self-serve share (SHARE reqs).
- Preview generation progress stuck at 52% in UI while backend completes (polling bug).
- "End session" button missing from Beta Sessions panel after start.
- "Revisar novamente" runs QA but does not emit `mission_completed` for review.
- `ctaProminence` blocking tuned in Phase 94 (warning-only dimension).
