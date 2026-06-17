---
phase: 131-learning-impact-measurement
plan: "01"
subsystem: api
tags: [zod, drizzle, postgres, jsonb, output-learning, human-quality]

requires:
  - phase: 129-live-human-quality-corpus
    provides: HumanQualityQualitySnapshot contract and privacy-safe payload validation
  - phase: v12.4-output-learning
    provides: AppliedLearningTrace shape and recommendation accept flow
provides:
  - Bounded OutputLearningApplicationSnapshot type and Zod validation
  - derivations.output_learning_application jsonb persistence
  - API threading on batch derivations POST and regenerate inherit/override
affects:
  - 131-02 accept flow wiring and corpus freeze
  - 131-03 impact report engine
  - 131-04 evidence CLI and Impact UI tab

tech-stack:
  added: []
  patterns:
    - "Strict Zod schema with corpus forbidden-key stripping for attribution snapshots"
    - "Identical application snapshot applied to every job in batch derivation POST"
    - "Regenerate child inherits parent outputLearningApplication unless body overrides"

key-files:
  created:
    - app/src/server/human-quality/application-schema.ts
    - app/tests/unit/human-quality/impact/application-schema.test.ts
    - app/drizzle/0045_derivation_output_learning_application.sql
    - app/src/app/api/campaigns/[id]/derivations/route.test.ts
  modified:
    - app/src/server/human-quality/corpus.ts
    - app/src/server/db/schema.ts
    - app/src/server/repositories/derivation.ts
    - app/src/app/api/campaigns/[id]/derivations/route.ts
    - app/src/app/api/derivations/[id]/regenerate/route.ts
    - app/src/app/api/derivations/[id]/regenerate/route.test.ts
    - app/drizzle/meta/_journal.json

key-decisions:
  - "Store attribution on derivations jsonb; legacy null resolves to not_recorded at read time"
  - "Reject unbounded AppliedLearningTrace entries — IDs and keys only in snapshot"
  - "Batch derivations POST applies identical snapshot to all jobs when body includes application"

patterns-established:
  - "outputLearningApplicationSchema strict Zod with traceId /^ol-/ and learningsSource postgres only"
  - "buildApplicationSnapshotFromAccept maps recommendation accept into recorded snapshot"
  - "resolveOutputLearningApplication provides honest legacy default for missing rows"

requirements-completed: [IMPACT-01]

duration: 12min
completed: 2026-06-17
---

# Phase 131 Plan 01: Application Snapshot Schema and API Persistence Summary

**Bounded output-learning application snapshots validated with Zod, persisted on derivations via jsonb, and threaded through batch create and regenerate API routes.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-17T09:54:00Z
- **Completed:** 2026-06-17T09:57:30Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Defined `OutputLearningApplicationSnapshot` with forbidden-key rejection and legacy `not_recorded` resolution
- Added `derivations.output_learning_application` migration and Drizzle/repository wiring
- Batch derivations POST validates, sanitizes, and persists identical snapshot on every job
- Regenerate inherits parent attribution unless POST body supplies override snapshot

## Task Commits

Each task was committed atomically:

1. **Task 1: Define bounded application snapshot contract** - `10517185` (feat)
2. **Task 2: Persist application on derivation create and regenerate** - `7ebc5ead` (feat)

## Files Created/Modified

- `app/src/server/human-quality/application-schema.ts` - Zod schema, sanitize, accept builder, legacy resolver
- `app/src/server/human-quality/corpus.ts` - `OutputLearningApplicationSnapshot` type on quality snapshot
- `app/drizzle/0045_derivation_output_learning_application.sql` - Nullable jsonb column
- `app/src/server/repositories/derivation.ts` - `CreateDerivationInput.outputLearningApplication`
- `app/src/app/api/campaigns/[id]/derivations/route.ts` - POST body validation and batch threading
- `app/src/app/api/derivations/[id]/regenerate/route.ts` - Parent inherit with optional override
- `app/tests/unit/human-quality/impact/application-schema.test.ts` - Schema contract tests
- `app/src/app/api/campaigns/[id]/derivations/route.test.ts` - Batch POST application tests
- `app/src/app/api/derivations/[id]/regenerate/route.test.ts` - Inherit/override tests

## Decisions Made

- Legacy rows without jsonb resolve via `resolveOutputLearningApplication` to `applied: false, resolution: not_recorded`
- Full `AppliedLearningTrace.entries` are never stored — only bounded attribution IDs and keys
- Invalid application payloads return 400 at API boundary before `createDerivation`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added next-intl mock to derivations route tests**
- **Found during:** Task 2 (route test for 400 validation paths)
- **Issue:** `apiError` calls `getTranslations` which threw in vitest without mock
- **Fix:** Added `next-intl/server` mock matching other campaign route tests
- **Files modified:** `app/src/app/api/campaigns/[id]/derivations/route.test.ts`
- **Committed in:** `7ebc5ead`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test infrastructure only; no production behavior change.

## Issues Encountered

None beyond the test mock gap above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 131-02 can wire accept flow → derivations POST and freeze snapshot into corpus `qualitySnapshot`
- Migration `0045` must be applied to dev/staging databases before live attribution persistence

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/application-schema.ts
- FOUND: app/drizzle/0045_derivation_output_learning_application.sql
- FOUND: app/src/app/api/campaigns/[id]/derivations/route.test.ts
- FOUND: commit 10517185
- FOUND: commit 7ebc5ead

---
*Phase: 131-learning-impact-measurement*
*Completed: 2026-06-17*
