---
phase: 134-live-corpus-operations
plan: "01"
subsystem: api
tags: [human-quality, corpus, batch-selection, queue-progress, vitest]

requires:
  - phase: 129-live-human-quality-corpus
    provides: selectDerivationForCorpus, listPendingCorpusQueue, owner-only corpus API
provides:
  - batchSelectDerivationsForCorpus with per-item outcomes
  - getCorpusQueueProgress operational summary by cohort/mode/format
  - GET includeProgress and POST batch derivationIds on corpus API
affects:
  - 134-02 operator review UX
  - 134-03 phase verification

tech-stack:
  added: []
  patterns:
    - "Batch selection reuses selectDerivationForCorpus; errors map to per-item outcomes"
    - "Queue progress aggregates pending/evaluated without trend or sufficiency claims"
    - "API z.union for single derivationId vs bounded derivationIds batch POST"

key-files:
  created:
    - app/tests/unit/human-quality/live-corpus-operations.test.ts
  modified:
    - app/src/server/human-quality/service.ts
    - app/src/server/repositories/human-quality-corpus.ts
    - app/src/app/api/feedback/human-quality-corpus/route.ts
    - app/src/app/api/feedback/human-quality-corpus/route.test.ts

key-decisions:
  - "MAX_CORPUS_BATCH_SIZE=25 for conservative operator batch cap"
  - "Batch POST returns 200 with results/summary; single POST keeps 201 item response"
  - "GET includeProgress=true opt-in to avoid extra query on default queue reads"

patterns-established:
  - "Per-item batch outcomes: selected, duplicate, invalid, missing_profile, unsafe_payload"
  - "Progress summary exposes counts and latest timestamps only — no trend math"

requirements-completed: [LIVEQUAL-01, LIVEQUAL-02, LIVEQUAL-04]

duration: 12min
completed: 2026-06-17
---

# Phase 134 Plan 01: Batch Selection and Queue Progress Contracts Summary

**Batch corpus selection with per-item outcomes and workspace queue progress summaries on the existing owner-only corpus API**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-17T16:57:00Z
- **Completed:** 2026-06-17T17:00:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Operators can submit bounded batches of derivation IDs and receive per-item selected/duplicate/invalid/missing-profile/unsafe-payload outcomes without failing the whole batch
- Queue progress can be queried by workspace with pending/evaluated totals grouped by cohort, generation mode and format
- Owner-only API extended: `GET ?includeProgress=true` and `POST` with `derivationIds` array while preserving privacy boundaries

## Task Commits

Each task was committed atomically:

1. **Task 1: Add batch selection service with per-item outcomes** - `900f1719` (feat)
2. **Task 2: Add queue progress summary repository/service contracts** - `dec0ee5f` (feat)
3. **Task 3: Expose owner-only batch/progress API** - `8b53e688` (feat)

## Files Created/Modified

- `app/tests/unit/human-quality/live-corpus-operations.test.ts` - Unit tests for batch selection and queue progress service contracts
- `app/src/server/human-quality/service.ts` - `batchSelectDerivationsForCorpus`, `getCorpusQueueProgress`, batch types and cap constant
- `app/src/server/repositories/human-quality-corpus.ts` - `getCorpusOperationsProgress` aggregation query
- `app/src/app/api/feedback/human-quality-corpus/route.ts` - Batch POST and optional progress on GET
- `app/src/app/api/feedback/human-quality-corpus/route.test.ts` - API tests for batch and progress paths

## Decisions Made

- Batch size cap of 25 derivations per request (conservative operator limit)
- Batch responses use HTTP 200 with `{ results, summary }`; single-item selection unchanged at 201
- Progress metadata is opt-in via `includeProgress=true` to keep default queue reads lean

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 134-02 can wire operator UI to batch selection and progress endpoints
- Fast evaluation loop and panel progress display are the next consumer surfaces
- LIVEQUAL-03 (fast reviewer flow) remains for plan 134-02

## Self-Check: PASSED

- FOUND: app/tests/unit/human-quality/live-corpus-operations.test.ts
- FOUND: app/src/server/human-quality/service.ts
- FOUND: app/src/server/repositories/human-quality-corpus.ts
- FOUND: app/src/app/api/feedback/human-quality-corpus/route.ts
- FOUND: 900f1719
- FOUND: dec0ee5f
- FOUND: 8b53e688

---
*Phase: 134-live-corpus-operations*
*Completed: 2026-06-17*
