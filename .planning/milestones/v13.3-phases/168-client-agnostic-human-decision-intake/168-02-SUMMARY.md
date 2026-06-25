---
phase: 168-client-agnostic-human-decision-intake
plan: 02
subsystem: ui
tags: [human-quality, corpus-queue, fixture-safe-copy, vitest]

requires:
  - phase: 168-client-agnostic-human-decision-intake
    plan: 01
    provides: Generic decisionEvidence writes from corpus evaluations
provides:
  - clientProfileId queue filter and metadata visibility in HumanQualityCorpusPanel
  - Fixture-safe source label copy helpers and per-row evidence caveats
  - Submit mutation tolerant of legacy and decisionEvidence response shapes
affects:
  - 168-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Human-readable source labels with explicit fixture/operator caveats in corpus review UI"
    - "Queue query keys include clientProfileId only when filter is set"

key-files:
  created: []
  modified:
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx
    - app/src/components/admin/calibration-status-copy.ts
    - app/src/components/admin/calibration-status-copy.test.ts

key-decisions:
  - "Queue clientProfileId filter lives in global scope alongside other queue dimension filters"
  - "Fixture and operator-imported sources get distinct warning copy; real_customer shows no caveat"

patterns-established:
  - "formatHumanQualitySourceLabel / getHumanQualitySourceCaveat centralize corpus source display copy"

requirements-completed: [DECISION-01, DECISION-03]

duration: 12min
completed: 2026-06-25
---

# Phase 168 Plan 02: Client-Agnostic Corpus Review UI Summary

**Owner corpus review now filters by clientProfileId, shows fixture-safe source labels with evidence caveats, and submits evaluations without depending on decisionEvidence in the API response.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-25T07:50:00Z
- **Completed:** 2026-06-25T08:02:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Extended `CorpusQueueFilterState` with `clientProfileId`; wired fetch, query keys, global-scope filter input, and current-item metadata
- Added `formatHumanQualitySourceLabel` / `getHumanQualitySourceCaveat` and differentiated calibration warning banners for fixture vs operator evidence
- Kept submit mutation UI-success path independent of `decisionEvidence`; tests cover legacy and enriched response shapes

## Task Commits

Each task was committed atomically (tasks 1 and 3 share panel files, committed together):

1. **Task 1: Add clientProfileId visibility and filter to corpus queue** - `19f1c1f0` (feat, with Task 3)
2. **Task 2: Make fixture copy explicit and non-customer-specific** - `6d4aed7c` (feat)
3. **Task 3: Keep submit UX compatible with generic decision recording** - `19f1c1f0` (feat, with Task 1)

## Files Created/Modified

- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` - clientProfileId filter/metadata, source display copy, fixture caveats, tolerant submit payload parsing
- `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` - filter API param, metadata, fixture copy, legacy/decisionEvidence submit tests
- `app/src/components/admin/calibration-status-copy.ts` - source label copy helpers and differentiated non-customer banners
- `app/src/components/admin/calibration-status-copy.test.ts` - fixture vs operator banner and source copy assertions

## Decisions Made

- Queue `clientProfileId` filter is exposed only in global corpus scope, matching existing cohort/mode/format filter placement
- `synthetic_fixture` and `operator_imported` rows show distinct inline caveats; `real_customer` rows show label only
- Submit success invalidates queue keys including `clientProfileId` when set; no new brand-profile query keys added (none used in panel)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 168-03 can assert evidence reports using UI-visible source/profile context
- Owner can narrow global queue review per brand before evaluating fixture or real rows

---
*Phase: 168-client-agnostic-human-decision-intake*
*Completed: 2026-06-25*

## Self-Check: PASSED

- FOUND: app/src/components/feedback/HumanQualityCorpusPanel.tsx
- FOUND: app/src/components/feedback/HumanQualityCorpusPanel.test.tsx
- FOUND: app/src/components/admin/calibration-status-copy.ts
- FOUND: app/src/components/admin/calibration-status-copy.test.ts
- FOUND: 6d4aed7c
- FOUND: 19f1c1f0
