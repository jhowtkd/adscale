---
gsd_state_version: 1.0
milestone: v11.2
milestone_name: Beta Access and Credit Entitlements
status: phase_planned
last_updated: "2026-06-03T00:00:00.000Z"
last_activity: 2026-06-03
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 17
  completed_plans: 16
  percent: 94
---

# State: ADScale

## Current Position

Milestone: v11.2 — Beta Access and Credit Entitlements
Phase: 49 (beta-access-and-credit-entitlements) — PLANNED
Plan: 49-01-PLAN.md
Status: Ready for `$gsd-execute-phase 49`; v11.1 quality work remains complete and can still be archived separately.
Last activity: 2026-06-03

## Accumulated Context

- Phase 47 delivered typed campaign load errors, derivation verdict badges, review modal with contract context, and regenerate-with-fixes feedback dialog
- 610 tests passing, build clean after Phase 47
- Phase 46 quality gate fields consumed in workspace UI without re-running gate in browser
- Phase 49 planning reviewed current billing code: spend gates require active Stripe subscription plus credits, credit costs use `image_derivation: 5`, pricing UI currently maps Trial/Starter 30 credits to 6 images, and there is no beta entitlement path yet.

## Key Decisions

- Phase 47-01: `CampaignLoadError` taxonomy maps API `code` + HTTP status + timeout signals to localized `CampaignErrorState` variants
- Phase 47-02: Verdict badge is primary over raw score; `scoreCappedForDisplay` caps invalid scores at 59
- Phase 47-03: `DerivationReviewModal` replaces toast-only preview; compare mode deferred
- Phase 47-04: `buildRegenerationFeedback` prefers `regenerationSuggestion`, else concatenates hard failures; dialog allows edit before POST
- Phase 49: User-facing monetization should be ads/credits, not raw provider tokens. Provider token pricing remains an internal pricing assumption.
- Phase 49: Beta tester access must not use fake Stripe subscriptions; implement a separate entitlement/grant path and enforce the 10-ad cap in the existing server spend gate.

## Next Steps

1. Run `$gsd-execute-phase 49`.
2. Verify beta access with unit tests plus at least one local signup/onboarding or seeded workspace smoke check.
3. Run `npm run build` from `app`.

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

**Current focus:** Milestone v11.1 closeout (archive + manual visual sign-off)
