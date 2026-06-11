---
gsd_state_version: 1.0
milestone: v12.0
milestone_name: Monetização Real
status: pending_milestone_close
stopped_at: LIVE-02 partial — prod checkout needed for grant idempotency proof
last_updated: "2026-06-11T18:25:00.000Z"
last_activity: 2026-06-11 — pushed v12.0 billing to prod (dep-d8lfm4jbc2fs73d2qni0); webhook signature smoke PASS
progress:
  milestone_phases: 6
  milestone_phases_complete: 6
  requirements_total: 19
  requirements_complete: 18
  percent_phases: 100
  percent_requirements: 95
---

# State: ADScale

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-08)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Milestone v12.0 Monetização Real — production Stripe billing, beta→paid conversion, subscription lifecycle.

**Parallel track:** v11.11 complete (2026-06-11). All phases 90–96 shipped including Phase 94 learning closure + READY-10 threshold tune.

## Current Position

Phase: 102 of 102 — Billing Regression and Release Gate
Plan: 102-01 complete
Status: v12.0 code-complete — milestone **not** closed until LIVE-02
Last activity: 2026-06-11 — Release gate green; operator smoke pending

Progress: [█████████░] 18/19 requirements · phases 97–102 complete

## Accumulated Context

- Stripe stack exists: checkout (14d trial), portal, webhook (`checkout.session.completed`, subscription sync, `invoice.paid`, `invoice.payment_failed`).
- Plans: starter/growth/scale with monthly credit grants (30/120/360).
- Beta path: code redemption → 10 ads (50 credits), parallel to paid; no fake Stripe subs.
- `past_due` policy: existing credits spendable; label "Pagamento pendente"; `invoice.paid` grants suspended until `active`/`trialing`.
- `/api/billing/status` exposes `pastDue.recoveryAction: portal` and `access.hasSpendAccess` for BillingTab recovery CTA.
- `invoice.paid` grants are idempotent on `stripe_invoice` + `invoice.id` sourceId.
- Structured 402 conversion contract drives preview gate, mission upgrade, and spend routes (`reason`, `recommendedAction`, `returnPath`).
- BillingTab surfaces localized account states (trial/active/past-due/canceled/beta/none) with grant ledger history; internal COGS forecast stays separate.
- `/api/billing/status` exposes `canceled.recoveryAction: checkout` alongside `pastDue.recoveryAction: portal`.
- `/api/billing/history` returns `grants` ledger entries (source, amount, date).
- Phase 101: `101-PRODUCTION-RUNBOOK.md` + `npm run preflight:stripe`; live webhook evidence template at `101-WEBHOOK-EVIDENCE.md`.
- Phase 102: `102-VERIFICATION.md` maps all v12.0 requirements; release gate green (1061 tests, lint 0 errors, build OK); QA-07/08/09 complete.

## Session Continuity

Last session: 2026-06-11T18:04:27.160Z
Stopped at: Completed 102-01-PLAN.md

## Blockers

- **LIVE-02 (milestone close):** Webhook signature verified on production (`we_1ThD7e…`, deploy `dep-d8lfm4jbc2fs73d2qni0`). **Remaining:** operator Starter checkout on prod app → confirm `invoice.paid` grant + idempotency → fill sign-off in `101-WEBHOOK-EVIDENCE.md`.

## Human verification deferred (non-blocking for code)

- **Phase 98:** Past-due BillingTab banner + portal CTA in browser; staging `invoice.payment_failed` webhook.
- **Phase 99:** Preview gate checkout return path; beta-exhausted and paid-insufficient CTA routing UAT.
- **Phase 100:** BillingTab visual states (trial/active/beta/past_due/canceled) in PT-BR and EN.
- **Phase 101:** Live deploy, checkout, portal, and signed webhook on production Stripe.

## SESS-03 follow-ups (UX friction found during real sessions, 2026-06-11)

- Share/approval-package UI fix local (empty state + section header) — deploy pending; SESS-03 used `POST /api/share` when panel returned null for preview-only approved.
- Preview progress 52% fix shipped (`84884ef2`, Render `dep-d8lc64urnols73dsm8k0`) — post-deploy Playwright: 18%→43%→70% (animated, not stuck at 52%).
- "End session" shipped (`c5e5be7a`) — sticky header + session restore; post-deploy Playwright: `endSessionVisible: true` on `/feedback`.
- "Revisar novamente" `mission_completed` shipped (`c32c924e`) — redeploy `dep-d8ldijj7uimc73dnjnq0` after stuck build cancelled.
- `ctaProminence` blocking tuned in Phase 94 (warning-only dimension).
