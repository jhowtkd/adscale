---
phase: 117-factual-vs-visual-separation
plan: "03"
subsystem: api
tags: [derivation-job, factual-visual-separation, lineage-firewall, format-adaptation, vitest, SEP-03]

requires:
  - phase: 117-factual-vs-visual-separation
    plan: "01"
    provides: CONTAMINATION_FAILURE_CODES and factual-visual-separation module
  - phase: 117-factual-vs-visual-separation
    plan: "04"
    provides: invented_factual_entity in contamination set for lineage checks
provides:
  - parentHasContamination and assertParentFactualLineage helpers
  - Job-time lineage guard before parent output download for format_adaptation
affects:
  - 118-per-mode-rules
  - 120-gate-hardening

tech-stack:
  added: []
  patterns:
    - "Derive lineage contamination at job time from parent qualityVerdict and hardFailures — no DB migration"
    - "assertParentFactualLineage reads live CONTAMINATION_FAILURE_CODES export"

key-files:
  created: []
  modified:
    - app/src/server/ai/factual-visual-separation.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/jobs/derivation.test.ts
    - app/src/app/api/derivations/[id]/delivery-package/route.test.ts

key-decisions:
  - "Lineage guard runs immediately after usesParentOutput is determined, before downloadBuffer"
  - "Clean parent test fixtures must include qualityVerdict acceptable and empty hardFailures"

patterns-established:
  - "Format adaptation parent output blocked when parent qualityVerdict is invalid or hardFailures include any contamination code"

requirements-completed: [SEP-03]

duration: 8min
completed: 2026-06-15
---

# Phase 117 Plan 03: Contaminated Lineage Firewall Summary

**Job-time assertParentFactualLineage blocks format_adaptation from downloading contaminated parent output using live CONTAMINATION_FAILURE_CODES**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `parentHasContamination` and `assertParentFactualLineage` to factual-visual-separation module
- Wired lineage guard into derivation job before `downloadBuffer(parentDerivation.outputKey)`
- Added unit tests for helper edge cases (null parent, invalid verdict, contamination codes, clean parent)
- Added integration test proving contaminated parent throws before parent download
- Extended delivery-package route test for `copied_style_reference_facts` hard failure blocking

## Task Commits

1. **Task 1: Implement assertParentFactualLineage helper** — `90c773bd` (feat)
2. **Task 2: Wire lineage guard into derivation job before parent download** — `7d159d4b` (feat)

## Files Created/Modified

- `app/src/server/ai/factual-visual-separation.ts` — Lineage helpers reading `CONTAMINATION_FAILURE_CODES`
- `app/src/server/jobs/derivation.ts` — `assertParentFactualLineage` call when `usesParentOutput`
- `app/src/server/jobs/derivation.test.ts` — `contaminated parent` describe with helper and job integration tests
- `app/src/app/api/derivations/[id]/delivery-package/route.test.ts` — Contamination hard failure 409 case

## Decisions Made

- No `factualLineageStatus` DB column — contamination derived at job time per RESEARCH A4
- Existing `getDerivationById` `select()` already returns `qualityVerdict` and `hardFailures`; no repository change needed
- Parent fixture in format adaptation success test updated with clean lineage fields

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- Task 1 marked `tdd="true"`; helper unit tests committed alongside wiring in task 2 commit (`7d159d4b`) while helper implementation landed in task 1 (`90c773bd`)
- All `contaminated parent` tests pass after both commits applied

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SEP-03 complete; contaminated parents cannot propagate to child format adaptations at job time
- Phase 118 per-mode rules can assume lineage firewall is active for package format adaptation

## Self-Check: PASSED

- FOUND: app/src/server/ai/factual-visual-separation.ts
- FOUND: app/src/server/jobs/derivation.ts
- FOUND: .planning/phases/117-factual-vs-visual-separation/117-03-SUMMARY.md
- FOUND: commit 90c773bd
- FOUND: commit 7d159d4b

---
*Phase: 117-factual-vs-visual-separation*
*Completed: 2026-06-15*
