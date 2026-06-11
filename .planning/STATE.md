---
gsd_state_version: 1.0
milestone: v12.0
milestone_name: Monetização Real
status: In Progress
stopped_at: Completed 97-01-PLAN.md
last_updated: "2026-06-11T17:40:35.808Z"
last_activity: 2026-06-11 — Phase 97 plan 01 complete (billing contracts + idempotent grants)
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 6
  completed_plans: 1
  percent: 17
---

# State: ADScale

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-08)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Milestone v12.0 Monetização Real — production Stripe billing, beta→paid conversion, subscription lifecycle.

**Parallel track:** v11.11 complete (2026-06-11). All phases 90–96 shipped including Phase 94 learning closure + READY-10 threshold tune.

## Current Position

Phase: 98 of 102 — Past-Due Policy and Recovery
Plan: Ready for 98-01
Status: Phase 97 complete
Last activity: 2026-06-11 — Phase 97 plan 01 complete (billing contracts + idempotent grants)

Progress: [██░░░░░░░░] 17%

## Accumulated Context

- Stripe stack exists: checkout (14d trial), portal, webhook (`checkout.session.completed`, subscription sync, `invoice.paid`, `invoice.payment_failed`).
- Plans: starter/growth/scale with monthly credit grants (30/120/360).
- Beta path: code redemption → 10 ads (50 credits), parallel to paid; no fake Stripe subs.
- `getActiveSubscriptionByWorkspace` still gates paid spend on `active`/`trialing`; `getLatestSubscriptionByWorkspace` exposes `past_due`/`canceled` via normalized `subscriptionStatus`.
- `invoice.paid` grants are idempotent on `stripe_invoice` + `invoice.id` sourceId.
- v11.7 upgrade CTAs exist at value moments; need wiring to checkout from 402 surfaces.
- BillingTab has forecast calculator (internal COGS) — keep separate from user-facing credits.

## Session Continuity

Last session: 2026-06-11T17:40:35.805Z
Stopped at: Completed 97-01-PLAN.md

## Blockers

- None. v11.11 closed; focus on v12.0 Monetização Real.

## SESS-03 follow-ups (UX friction found during real sessions, 2026-06-11)

- Share/approval-package UI fix local (empty state + section header) — deploy pending; SESS-03 used `POST /api/share` when panel returned null for preview-only approved.
- Preview progress 52% fix shipped (`84884ef2`, Render `dep-d8lc64urnols73dsm8k0`) — post-deploy Playwright: 18%→43%→70% (animated, not stuck at 52%).
- "End session" shipped (`c5e5be7a`) — sticky header + session restore; post-deploy Playwright: `endSessionVisible: true` on `/feedback`.
- "Revisar novamente" `mission_completed` shipped (`c32c924e`) — redeploy `dep-d8ldijj7uimc73dnjnq0` after stuck build cancelled.
- `ctaProminence` blocking tuned in Phase 94 (warning-only dimension).
