---
phase: 170-product-narrative-rollout
plan: 02
subsystem: i18n
tags: [next-intl, brand, onboarding, empty-state, curator]

requires:
  - phase: 170-product-narrative-rollout
    plan: 01
    provides: Vitest copy guard and in-app copy checklist
provides:
  - Curator-framed onboarding tour copy (5 steps, EN + PT-BR)
  - Curator-framed empty states on dashboard, campaigns, library, derivation gallery, templates
  - Enabled curator vocabulary assertions in copy guard
affects:
  - 170-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Brief → batch → curate narrative arc on first-touch surfaces"
    - "Curator/curador role framing without internal jargon"

key-files:
  created: []
  modified:
    - app/messages/en.json
    - app/messages/pt-BR.json
    - app/tests/unit/i18n/product-narrative-copy.test.ts

key-decisions:
  - "Generation gallery empty keys live under derivation namespace; updated derivation.empty* not generation.*"
  - "Campaigns list empty copy updated via common.* keys used by campaigns page EmptyState"
  - "Removed emoji from onboarding step1Title per CONTEXT discretion"

patterns-established:
  - "Onboarding steps 1–5 map to welcome → briefing inputs → curation queue → structured brief → credits"

requirements-completed: [BRAND-01, BRAND-02]

duration: 5min
completed: 2026-06-25
---

# Phase 170 Plan 02: Onboarding and Empty States Summary

**Five-step dashboard tour and empty states rewritten with brief → batch → curate curator framing in EN and PT-BR**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-25T08:31:00Z
- **Completed:** 2026-06-25T08:34:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Rewrote all five `onboarding.step*` keys with curator arc; removed 👋 from step1Title.
- Updated empty-state copy on dashboard home, campaigns list (`common.*`), derivation gallery, library, and templates.
- Enabled five curator vocabulary assertions in `product-narrative-copy.test.ts` (18 tests passing).

## Task Commits

1. **Task 1: Rewrite dashboard onboarding tour copy** - `4c30daaf` (feat)
2. **Task 2: Rewrite empty-state copy across dashboard and library surfaces** - `cd029e46` (feat)

## Files Created/Modified

- `app/messages/en.json` - Onboarding and empty-state narrative (EN)
- `app/messages/pt-BR.json` - Onboarding and empty-state narrative (PT-BR)
- `app/tests/unit/i18n/product-narrative-copy.test.ts` - Curator vocabulary tests enabled

## Decisions Made

- Gallery empty keys are under `derivation.*` (not `generation.*`); updated the keys the UI actually consumes.
- Campaigns list empty states use `common.noCampaignsYet` / `createFirstCampaign` per `useCampaignsPage` wiring.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can extend curator framing to campaign wizard, generation CTAs, review guidance, and metadata.
- Copy guard green on parity, forbidden patterns, and curator vocabulary for onboarding steps.

---
*Phase: 170-product-narrative-rollout*
*Completed: 2026-06-25*

## Self-Check: PASSED

- FOUND: app/messages/en.json
- FOUND: app/messages/pt-BR.json
- FOUND: app/tests/unit/i18n/product-narrative-copy.test.ts
- FOUND: 4c30daaf
- FOUND: cd029e46
