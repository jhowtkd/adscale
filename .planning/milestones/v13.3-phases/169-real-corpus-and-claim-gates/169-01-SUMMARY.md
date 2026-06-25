---
phase: 169-real-corpus-and-claim-gates
plan: 01
subsystem: api
tags: [human-quality, corpus, source-label, promotion, vitest]

requires:
  - phase: 168-client-agnostic-human-decision-intake
    provides: Generic clientProfileId-scoped corpus evaluation and queue context
provides:
  - parseOwnerPromotionSourceLabel for owner-supplied operator_imported and real_customer labels
  - Optional sourceLabel on promote API and promoteCorpusCandidateToQueue
  - Tests proving auto-capture defaults and promotion guards remain client-agnostic
affects:
  - 169-real-corpus-and-claim-gates (plans 02-03 evidence and claim gates)

tech-stack:
  added: []
  patterns:
    - "Source label lives on corpus candidates; promotion may override label at mark-promoted time"
    - "Owner explicit labels restricted to operator_imported/real_customer unless candidate is synthetic_fixture"

key-files:
  created: []
  modified:
    - app/src/server/human-quality/source-label.ts
    - app/src/server/human-quality/candidate-promotion.ts
    - app/src/server/repositories/human-quality-candidate.ts
    - app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.ts
    - app/tests/unit/human-quality/candidate-promotion.test.ts
    - app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts

key-decisions:
  - "Explicit owner promotion accepts operator_imported and real_customer; synthetic_fixture only when candidate already carries it"
  - "Candidate source label updates at promotion time via markCorpusCandidatePromoted optional override"

patterns-established:
  - "Client-agnostic promotion: any clientProfileId with validated source label, no customer-name branches"

requirements-completed: [SOURCE-01, SOURCE-02]

duration: 12min
completed: 2026-06-25
---

# Phase 169 Plan 01: Source-Labeled Promotion Summary

**Owner promotion accepts optional `sourceLabel` (`operator_imported` / `real_customer`) while preserving auto-capture defaults and blocking missing `clientProfileId`**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-25T08:09:00Z
- **Completed:** 2026-06-25T08:21:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `parseOwnerPromotionSourceLabel` with narrow owner-supplied label validation
- Extended `promoteCorpusCandidateToQueue` and owner promote route with optional `sourceLabel`
- Added 18 passing unit tests across promotion, capture defaults, and route validation
- Confirmed no Cenbrap-specific branches in human-quality promotion paths

## Task Commits

1. **Task 1: Add explicit source-label validation for promotion** - `c2e3ac2f` (feat)
2. **Task 2: Expose source label in owner promote route** - `0560709d` (feat)
3. **Task 3: Prove auto-capture defaults still work** - `654d9463` (test)

## Files Created/Modified

- `app/src/server/human-quality/source-label.ts` - Owner promotion source label parser
- `app/src/server/human-quality/candidate-promotion.ts` - Optional sourceLabel input and validation
- `app/src/server/repositories/human-quality-candidate.ts` - Optional sourceLabel on mark promoted
- `app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.ts` - Route schema and passthrough
- `app/tests/unit/human-quality/candidate-promotion.test.ts` - Promotion label and guard tests
- `app/src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts` - Route coverage

## Decisions Made

- Owner explicit labels default to candidate label; only `operator_imported` and `real_customer` may be set unless candidate is already `synthetic_fixture`
- Source label override persists on the candidate row at promotion time (joined for queue/evidence semantics)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended markCorpusCandidatePromoted for source label override**
- **Found during:** Task 1 (promotion service)
- **Issue:** Corpus source semantics are stored on candidates; promotion needed a repository seam to persist explicit owner label
- **Fix:** Added optional `sourceLabel` to `markCorpusCandidatePromoted`
- **Files modified:** `app/src/server/repositories/human-quality-candidate.ts`
- **Verification:** Promotion unit tests pass
- **Committed in:** `c2e3ac2f`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for source label to flow to queue/evidence joins; no scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can add active-scope evidence filters and source composition by `clientProfileId`
- Plan 03 can wire claim gates and release evidence using the now-explicit promotion labels

## Self-Check: PASSED

- FOUND: `.planning/phases/169-real-corpus-and-claim-gates/169-01-SUMMARY.md`
- FOUND: `c2e3ac2f`
- FOUND: `0560709d`
- FOUND: `654d9463`

---
*Phase: 169-real-corpus-and-claim-gates*
*Completed: 2026-06-25*
