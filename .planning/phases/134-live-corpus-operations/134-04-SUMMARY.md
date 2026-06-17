---
phase: 134-live-corpus-operations
plan: "04"
subsystem: api
tags: [human-quality, corpus, queue-progress, byCampaign, react]

requires:
  - phase: 134-live-corpus-operations
    provides: queue progress by cohort/mode/format and operator review panel
provides:
  - byCampaign pending/evaluated aggregation in getCorpusOperationsProgress
  - CorpusQueueProgress.byCampaign passthrough in service and GET includeProgress=true
  - By campaign breakdown table in QueueProgressSummary
affects:
  - 134-VERIFICATION.md LIVEQUAL-02 truth
  - Phase 135 sampling sufficiency (operational evidence completeness)

tech-stack:
  added: []
  patterns:
    - "Mirror byCohort/byGenerationMode/byFormat bumpStatusCount pattern for byCampaign using campaignId UUID slice keys"

key-files:
  created: []
  modified:
    - app/src/server/repositories/human-quality-corpus.ts
    - app/src/server/human-quality/service.ts
    - app/tests/unit/human-quality/live-corpus-operations.test.ts
    - app/src/app/api/feedback/human-quality-corpus/route.test.ts
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx

key-decisions:
  - "Use campaignId UUID as slice key without campaigns table join (names out of scope)"
  - "QueueProgressSummary grid lg:grid-cols-2 for four breakdown tables (cohort, campaign, mode, format)"

patterns-established:
  - "Campaign-dimensional queue progress mirrors existing dimensional aggregation via bumpStatusCount"

requirements-completed: [LIVEQUAL-02]

duration: 5min
completed: 2026-06-17
---

# Phase 134 Plan 04: Campaign-Dimensional Queue Progress Summary

**byCampaign pending/evaluated aggregation from repository through GET includeProgress=true to operator By campaign breakdown table**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-17T20:17:00Z
- **Completed:** 2026-06-17T20:19:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended `CorpusOperationsProgress` and `CorpusQueueProgress` with `byCampaign` using existing `bumpStatusCount` on `campaignId`
- GET `/api/feedback/human-quality-corpus?includeProgress=true` now returns `progress.byCampaign` automatically via service passthrough
- `QueueProgressSummary` renders a fourth breakdown table titled "By campaign" in a 2×2 grid layout

## Task Commits

Each task was committed atomically:

1. **Task 1: Add byCampaign aggregation through repository and service** - `e4ac0faa` (fix)
2. **Task 2: Render By campaign table in QueueProgressSummary** - `6bce9ab5` (fix)

## Files Created/Modified

- `app/src/server/repositories/human-quality-corpus.ts` - Select campaignId; aggregate byCampaign in getCorpusOperationsProgress
- `app/src/server/human-quality/service.ts` - CorpusQueueProgress.byCampaign passthrough
- `app/tests/unit/human-quality/live-corpus-operations.test.ts` - Multi-campaign byCampaign assertion
- `app/src/app/api/feedback/human-quality-corpus/route.test.ts` - progress.byCampaign route assertion
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` - By campaign ProgressBreakdownTable
- `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` - Fixture and UI assertions

## Decisions Made

- Campaign slice keys remain raw UUIDs (no campaign name lookup) per plan scope
- Breakdown grid changed from `lg:grid-cols-3` to `lg:grid-cols-2` to fit four tables cleanly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- LIVEQUAL-02 campaign-dimensional gap closed; Phase 134 automated truths achievable for campaign via progress summaries
- Operator live-data verification (human checkpoint from 134-03) remains data-dependent before Phase 135 sampling claims

---
*Phase: 134-live-corpus-operations*
*Completed: 2026-06-17*

## Self-Check: PASSED

- FOUND: .planning/phases/134-live-corpus-operations/134-04-SUMMARY.md
- FOUND: e4ac0faa
- FOUND: 6bce9ab5
