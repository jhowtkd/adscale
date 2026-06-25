---
phase: 170-product-narrative-rollout
plan: 01
subsystem: testing
tags: [vitest, i18n, next-intl, brand, copy-guard]

requires: []
provides:
  - BRAND-04 in-app copy review checklist
  - Automated Vitest copy guard for narrative namespaces
affects:
  - 170-02-PLAN.md
  - 170-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Vitest JSON import scan over next-intl message namespaces"
    - "Human checklist + machine guard dual gate for copy changes"

key-files:
  created:
    - marketing/brand/in-app-copy-checklist.md
    - app/tests/unit/i18n/product-narrative-copy.test.ts
  modified: []

key-decisions:
  - "Exclude auth magic-link keys from generic magic hype pattern scan"
  - "Defer curator vocabulary positive assertions to Plan 02 via it.todo and it.skip"
  - "Manual spot-check steps use bullets so numbered-criteria grep returns exactly 7"

patterns-established:
  - "Narrative namespace parity + forbidden-pattern dual assertion before copy edits"
  - "Review namespace scan limited to approve/reject guidance keys only"

requirements-completed: [BRAND-04]

duration: 8min
completed: 2026-06-25
---

# Phase 170 Plan 01: Copy Guard Wave 0 Summary

**BRAND-04 checklist plus Vitest copy guard scanning 11 narrative namespaces for locale parity and forbidden claims**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-25T08:22:00Z
- **Completed:** 2026-06-25T08:29:47Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Published `in-app-copy-checklist.md` with seven auditable criteria gating in-app copy changes.
- Added `product-narrative-copy.test.ts` with locale key-parity checks and forbidden-claim pattern scanner.
- Curator vocabulary positive tests scaffolded as todo/skip for Plan 02 copy rewrite.

## Task Commits

1. **Task 1: Add i18n copy guard test scaffold** - `11dae6cf` (test)
2. **Task 2: Publish in-app copy review checklist** - `3f297c6d` (docs)

## Files Created/Modified

- `marketing/brand/in-app-copy-checklist.md` - BRAND-04 human audit gate with criteria and run instructions
- `app/tests/unit/i18n/product-narrative-copy.test.ts` - Automated parity and forbidden-pattern guard

## Decisions Made

- Auth `magicLink*` keys excluded from the `magic` hype pattern to avoid false positives on passwordless sign-in copy.
- Manual spot-check section uses bullet list so plan verification grep (`^[0-9]+\.`) counts exactly seven criteria.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- RED: `11dae6cf` test commit with copy guard scaffold (parity + forbidden patterns pass on baseline; curator tests deferred).
- GREEN: N/A — deliverable is the test scaffold itself; no production i18n edits in this plan.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can rewrite onboarding/empty-state keys with copy guard running green on parity/forbidden checks.
- Enable skipped curator vocabulary tests when Plan 02 updates `onboarding.step*Desc` keys.

---
*Phase: 170-product-narrative-rollout*
*Completed: 2026-06-25*

## Self-Check: PASSED

- FOUND: marketing/brand/in-app-copy-checklist.md
- FOUND: app/tests/unit/i18n/product-narrative-copy.test.ts
- FOUND: 11dae6cf
- FOUND: 3f297c6d
