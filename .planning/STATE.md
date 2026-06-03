---
gsd_state_version: 1.0
milestone: v11.3
milestone_name: Site de Apresentação Separado
status: defining_requirements
last_updated: "2026-06-03T15:00:00.000Z"
last_activity: 2026-06-03
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: ADScale

## Current Position

Milestone: v11.3 — Site de Apresentação Separado
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements and roadmap for moving the public presentation site to `jhowtkd/site-adscale.git`.
Last activity: 2026-06-03

## Accumulated Context

- Phase 49 added workspace entitlements separate from Stripe subscriptions
- Beta testers receive 50 internal credits (10 ads at 5 credits each) via `source = beta_tester`
- `canSpend` allows active paid subscription OR active beta entitlement with available credits
- Billing UI distinguishes beta vs paid and exposes code redemption in settings
- The target marketing repo `jhowtkd/site-adscale.git` exists on `main` as a Vite + React + Tailwind landing site.
- ADScale_2 has public legal pages but no App Router root presentation page, so this milestone is mainly ownership/boundary, content alignment, and deploy validation.

## Key Decisions

- Phase 49: User-facing monetization uses ads/credits; provider tokens remain internal forecast inputs only
- Phase 49: Beta codes configured via `BETA_ACCESS_CODES` env (comma-separated), redeemed once per workspace
- Phase 49: No fake Stripe subscriptions for beta access
- Phase 50+: Marketing/presentation lives in `site-adscale`; app auth/dashboard/legal/product runtime stays in ADScale_2.

## Next Steps

1. Run `$gsd-plan-phase 50` to create the source/target audit and migration contract.
2. Execute target repo changes in `jhowtkd/site-adscale.git`.
3. Validate build, responsive browser QA, metadata, CTAs, and deployment/domain handoff.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Dedicated public presentation site migration to `site-adscale`.
