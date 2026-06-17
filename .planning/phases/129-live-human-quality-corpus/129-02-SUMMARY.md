---
phase: 129-live-human-quality-corpus
plan: "02"
subsystem: api
tags: [nextjs, human-quality, corpus, feedback-api, platform-owner]

requires:
  - phase: 129-01
    provides: Corpus schema, repository, privacy sanitization helpers
provides:
  - Platform-owner corpus selection and pending queue API
  - Structured human evaluation submission API
  - Route-facing human-quality service with ownership and payload guards
affects:
  - 129-03-evaluation-ui

tech-stack:
  added: []
  patterns:
    - "Platform-owner feedback routes for internal corpus operations"
    - "Service layer validates derivation/campaign ownership before repository writes"
    - "Reject forbidden corpus payload keys at service boundary before insert"

key-files:
  created:
    - app/src/server/human-quality/service.ts
    - app/src/app/api/feedback/human-quality-corpus/route.ts
    - app/src/app/api/feedback/human-quality-corpus/route.test.ts
    - app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.ts
    - app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts
    - app/tests/unit/human-quality/human-quality-service.test.ts
  modified:
    - app/src/server/repositories/human-quality-corpus.ts

key-decisions:
  - "All corpus API routes require platform owner; workspace scoping enforced via request body/query"
  - "Quality snapshots built from derivation metadata without prompt/outputKey leakage"
  - "Duplicate corpus version returns 409 before insert attempt"

patterns-established:
  - "HumanQualityServiceError codes map to HTTP status at route boundary"
  - "Explicit manual selection builds bounded artifactRef/qualitySnapshot from derivation row"

requirements-completed: [HUMAN-01, HUMAN-02, HUMAN-03, HUMAN-04]

duration: 12min
completed: 2026-06-17
---

# Phase 129 Plan 02: Internal Corpus API and Queue Service Summary

**Platform-owner feedback APIs for manual corpus selection, pending queue listing, and structured human evaluation with privacy-safe bounded snapshots**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-17T10:52:00Z
- **Completed:** 2026-06-17T11:04:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `POST/GET /api/feedback/human-quality-corpus` for explicit derivation selection and pending queue listing
- Added `POST /api/feedback/human-quality-corpus/[id]/evaluation` for visual score, factual pass, intent, and failure reason submission
- Implemented `human-quality/service.ts` with derivation ownership checks, cohort classification, duplicate guard, and evaluation validation
- Extended repository with `getCorpusItemById` and `findCorpusItemByDerivationVersion` helpers
- Covered admin boundary, duplicate handling, forbidden payload rejection, and invalid evaluation cases in route and service tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Create explicit corpus selection and queue listing API** - `f0c0017a` (feat)
2. **Task 2: Create human evaluation submission API** - `9a265546` (feat)
3. **Task 3: Protect admin/internal and privacy boundaries** - boundary tests co-located in `f0c0017a` and `9a265546` (test coverage within task 1/2 commits)

**Plan metadata:** pending (docs commit)

## Files Created/Modified

- `app/src/server/human-quality/service.ts` - Selection, queue, and evaluation orchestration
- `app/src/app/api/feedback/human-quality-corpus/route.ts` - Platform-owner select/list endpoints
- `app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.ts` - Evaluation submit endpoint
- `app/src/server/repositories/human-quality-corpus.ts` - Lookup helpers for item and duplicate detection
- `app/tests/unit/human-quality/human-quality-service.test.ts` - Service unit tests
- `app/src/app/api/feedback/human-quality-corpus/route.test.ts` - Route tests for selection/queue/boundaries
- `app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts` - Evaluation route tests

## Decisions Made

- Platform owner auth on all corpus routes matches existing feedback owner tooling (beta-sessions, reports list)
- Derivation quality snapshots exclude prompt/outputKey even when present on derivation row
- Duplicate workspace+derivation+version returns 409 rather than database constraint error

## Deviations from Plan

None - plan executed exactly as written.

Task 3 boundary tests were added alongside tasks 1 and 2 route/service test files rather than a separate commit, since they exercise the same endpoints.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 129-03 can wire owner evaluation UI to these APIs
- Pending queue and evaluation submit contracts are stable for one-at-a-time review UI

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/service.ts
- FOUND: app/src/app/api/feedback/human-quality-corpus/route.ts
- FOUND: app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.ts
- FOUND: f0c0017a
- FOUND: 9a265546

---
*Phase: 129-live-human-quality-corpus*
*Completed: 2026-06-17*
