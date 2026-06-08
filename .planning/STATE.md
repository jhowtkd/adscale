---
gsd_state_version: 1.0
milestone: v12.0
milestone_name: Monetização Real
status: Defining requirements
stopped_at: —
last_updated: "2026-06-08T18:00:00.000Z"
last_activity: 2026-06-08 — Milestone v12.0 started (parallel to v11.11 SESS-03)
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: ADScale

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-08)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Milestone v12.0 Monetização Real — production Stripe billing, beta→paid conversion, subscription lifecycle.

**Parallel track:** v11.11 Phases 93–94 blocked on SESS-03 (≥3 real operator sessions).

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-08 — Milestone v12.0 started

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

- None for planning. Execution of v12.0 does not require SESS-03, but beta conversion UX should not conflict with v11.11 learning closure.
