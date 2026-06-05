---
gsd_state_version: 1.0
milestone: v11.4
milestone_name: Beta Feedback Capture
status: defining_requirements
last_updated: "2026-06-05T00:00:00.000Z"
last_activity: 2026-06-05
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: ADScale

## Current Position

Milestone: v11.4 — Beta Feedback Capture
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-05 — Milestone v11.4 started

## Accumulated Context

- Marketing lives in `jhowtkd/site-adscale.git`; app stays in ADScale_2.
- `VITE_APP_URL` wires signup/login/legal from landing to app.
- Migration contract: `.planning/phases/50-source-and-boundary-audit/50-MIGRATION-CONTRACT.md`
- Launch handoff: `.planning/phases/52-launch-verification-and-handoff/52-HANDOFF.md`
- Beta access and credit entitlements already exist; feedback capture should use authenticated workspace context rather than public anonymous submission.
- Existing Sentry setup can provide error, request, breadcrumb and event correlation; feedback should add product context and asset references that Sentry alone does not know.

## Key Decisions

- Legal content source of truth: ADScale_2 `/privacy`, `/terms` (linked from marketing).
- Pricing copy on landing matches app tiers (R$47 / R$147 / R$397).
- Beta messaging: 10 ads via code in Settings.
- Feedback capture belongs in ADScale_2 authenticated app, not in the external marketing site.

## Next Steps

1. Define v11.4 feedback capture requirements.
2. Create roadmap starting at phase 53.
3. Plan phase 53 when requirements are approved.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Define beta feedback capture requirements.
