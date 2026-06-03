---
gsd_state_version: 1.0
milestone: v11.2
milestone_name: Beta Access and Credit Entitlements
status: milestone_complete
last_updated: "2026-06-03T12:00:00.000Z"
last_activity: 2026-06-03
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 100
---

# State: ADScale

## Current Position

Milestone: v11.2 — Beta Access and Credit Entitlements
Phase: 49 — Complete
Plan: 49-01-PLAN.md — Complete
Status: Milestone v11.2 delivered; run DB migration and set `BETA_ACCESS_CODES` before external beta.
Last activity: 2026-06-03

## Accumulated Context

- Phase 49 added workspace entitlements separate from Stripe subscriptions
- Beta testers receive 50 internal credits (10 ads at 5 credits each) via `source = beta_tester`
- `canSpend` allows active paid subscription OR active beta entitlement with available credits
- Billing UI distinguishes beta vs paid and exposes code redemption in settings

## Key Decisions

- Phase 49: User-facing monetization uses ads/credits; provider tokens remain internal forecast inputs only
- Phase 49: Beta codes configured via `BETA_ACCESS_CODES` env (comma-separated), redeemed once per workspace
- Phase 49: No fake Stripe subscriptions for beta access

## Next Steps

1. Apply migration `app/drizzle/0025_beta_entitlements.sql` in each environment.
2. Set `BETA_ACCESS_CODES` and distribute codes to testers.
3. Optional: run milestone audit / archive v11.2 artifacts.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Beta rollout operations (migration + env + manual smoke)
