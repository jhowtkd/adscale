---
phase: 170-product-narrative-rollout
plan: 03
subsystem: i18n
tags: [next-intl, brand, workflow, curator, copy-guard]

requires:
  - phase: 170-product-narrative-rollout
    plan: 01
    provides: Vitest copy guard and in-app copy checklist
  - phase: 170-product-narrative-rollout
    plan: 02
    provides: Onboarding and empty-state curator narrative
provides:
  - Workflow copy aligned brief → batch → curate across campaign, generation, review, settings
  - Extended copy guard with workflow curator vocabulary assertions (26 tests)
  - Phase 170 verification and BRAND-01..04 closure
affects:
  - 171-persistent-product-trust-baseline

tech-stack:
  added: []
  patterns:
    - "Workflow namespaces use AI-assisted variation + human approval framing"
    - "PT-BR curator identity via curador/cura/lote/briefing vocabulary"

key-files:
  created:
    - .planning/phases/170-product-narrative-rollout/170-VERIFICATION.md
  modified:
    - app/messages/en.json
    - app/messages/pt-BR.json
    - app/tests/unit/i18n/product-narrative-copy.test.ts
    - marketing/brand/in-app-copy-checklist.md
    - .planning/phases/170-product-narrative-rollout/170-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Review olhar/export/decision internals left unchanged per plan scope"
  - "signInSubtitle kept functional; curator framing conservative on signup only"
  - "Workflow curator tests cover EN and PT-BR with locale-specific vocabulary patterns"

patterns-established:
  - "Campaign wizard steps.* labels reinforce briefing before batch and curation at review"
  - "Generation and workspace.derivar modes framed as AI-assisted with human approval gate"

requirements-completed: [BRAND-01, BRAND-03, BRAND-04]

duration: 12min
completed: 2026-06-25
---

# Phase 170 Plan 03: Workflow Copy and Phase Verification Summary

**Campaign → generation → review → settings copy aligned to brief → batch → curate curator workflow with 26-test copy guard and phase verification**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-25T08:35:00Z
- **Completed:** 2026-06-25T08:38:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Aligned metadata, auth signup, campaign wizard, steps CTAs, generation modes, derivation options, review guidance, and settings workspace copy in EN + PT-BR.
- Extended copy guard with eight workflow curator vocabulary tests (26 total passing).
- Published `170-VERIFICATION.md`; marked BRAND-01..04 complete; Phase 170 ready for 171.

## Task Commits

1. **Task 1: Align workflow copy across campaign → generation → review → settings** - `177b58c3` (feat)
2. **Task 2: Extend copy guard coverage and publish phase verification** - `6a566a1a` (feat)

## Files Created/Modified

- `app/messages/en.json` - Workflow curator narrative (EN)
- `app/messages/pt-BR.json` - Workflow curator narrative (PT-BR, curador vocabulary)
- `app/tests/unit/i18n/product-narrative-copy.test.ts` - Workflow curator vocabulary assertions
- `marketing/brand/in-app-copy-checklist.md` - Last verified date and Plan 03 workflow keys
- `.planning/phases/170-product-narrative-rollout/170-VERIFICATION.md` - Checklist pass evidence
- `.planning/phases/170-product-narrative-rollout/170-VALIDATION.md` - All tasks green, nyquist compliant
- `.planning/REQUIREMENTS.md` - BRAND-03 complete
- `.planning/ROADMAP.md` - Phase 170 complete

## Decisions Made

- Olhar/review/export/decision internals unchanged — general guidance keys only for curator framing.
- Auth sign-in subtitle left functional; signup subtitle carries conservative curator promise.
- PT-BR uses curador/cura/lote/briefing — not operador.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 171 (Persistent Product Trust Baseline) unblocked — narrative foundation complete.
- Manual UX spot-check for wizard flow coherence recommended before external launch (documented in verification).

## Self-Check: PASSED

- FOUND: `.planning/phases/170-product-narrative-rollout/170-VERIFICATION.md`
- FOUND: `.planning/phases/170-product-narrative-rollout/170-03-SUMMARY.md`
- FOUND: commit `177b58c3`
- FOUND: commit `6a566a1a`

---
*Phase: 170-product-narrative-rollout*
*Completed: 2026-06-25*
