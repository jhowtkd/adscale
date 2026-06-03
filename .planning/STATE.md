---
gsd_state_version: 1.0
milestone: v11.3
milestone_name: Site de Apresentação Separado
status: complete
last_updated: "2026-06-03T18:00:00.000Z"
last_activity: 2026-06-03
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# State: ADScale

## Current Position

Milestone: v11.3 — Site de Apresentação Separado
Phase: 52 complete
Plan: 52-01
Status: Complete — owner browser QA + marketing deploy remain
Last activity: 2026-06-03

## Accumulated Context

- Marketing lives in `jhowtkd/site-adscale.git`; app stays in ADScale_2.
- `VITE_APP_URL` wires signup/login/legal from landing to app.
- Migration contract: `.planning/phases/50-source-and-boundary-audit/50-MIGRATION-CONTRACT.md`
- Launch handoff: `.planning/phases/52-launch-verification-and-handoff/52-HANDOFF.md`

## Key Decisions

- Legal content source of truth: ADScale_2 `/privacy`, `/terms` (linked from marketing).
- Pricing copy on landing matches app tiers (R$47 / R$147 / R$397).
- Beta messaging: 10 ads via code in Settings.

## Next Steps

1. Push `site-adscale` and deploy `dist/` with production `VITE_APP_URL`.
2. Run desktop/mobile smoke from `52-HANDOFF.md`.
3. Optional: fix ESLint in site-adscale, add `og:image`.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Deploy marketing site and validate production CTAs.
