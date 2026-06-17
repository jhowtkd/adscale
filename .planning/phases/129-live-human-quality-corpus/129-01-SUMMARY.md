---
phase: 129-live-human-quality-corpus
plan: "01"
subsystem: database
tags: [postgres, drizzle, human-quality, corpus, privacy]

requires: []
provides:
  - Canonical human-quality corpus enums and validation helpers
  - Postgres schema for corpus items and evaluations
  - Workspace-scoped repository for pending queue and evaluation submit
  - Privacy-safe artifactRef and qualitySnapshot sanitization
affects:
  - 129-02-internal-corpus-api
  - 129-03-evaluation-ui

tech-stack:
  added: []
  patterns:
    - "Bounded corpus snapshots mirroring output-decision-events privacy model"
    - "Reject-then-sanitize gate for forbidden prompt/URL/auth/model payload keys"

key-files:
  created:
    - app/src/server/human-quality/corpus.ts
    - app/src/server/repositories/human-quality-corpus.ts
    - app/drizzle/0043_human_quality_corpus.sql
    - app/tests/unit/human-quality/human-quality-corpus.test.ts
    - app/tests/unit/human-quality/human-quality-repository.test.ts
  modified:
    - app/src/server/db/schema.ts

key-decisions:
  - "Reject forbidden payload keys before persistence; strip only on already-safe inputs via buildQualitySnapshot"
  - "Unique corpus version per workspace+derivation to support versioned cohort comparisons"
  - "Separate visual score (0-100) and factual pass/fail in evaluation table"

patterns-established:
  - "sanitizeCorpusPayloads rejects then sanitizes artifactRef and qualitySnapshot at repository boundary"
  - "Cohort defaults to baseline when unspecified or invalid"

requirements-completed: [HUMAN-01, HUMAN-02, HUMAN-04]

duration: 5min
completed: 2026-06-17
---

# Phase 129 Plan 01: Canonical Human Quality Corpus Contract Summary

**Postgres-backed human-quality corpus with bounded snapshots, cohort/version scope, and privacy-safe persistence helpers**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-17T08:57:00Z
- **Completed:** 2026-06-17T08:59:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Defined corpus cohort, status, intent, and failure-reason contracts with visual score and factual pass validators
- Added `human_quality_corpus_items` and `human_quality_evaluations` tables with workspace-scoped indexes
- Implemented repository helpers for insert, list pending, and submit evaluation with workspace isolation
- Enforced privacy gate rejecting raw prompts, signed URLs, auth/session material, and model payloads

## Task Commits

Each task was committed atomically:

1. **Task 1: Define corpus and evaluation contracts** - `775253cd` (feat)
2. **Task 2: Add schema, migration, and repository helpers** - `f777d571` (feat)
3. **Task 3: Enforce privacy-safe corpus snapshots** - `ff1cb79a` (feat)

**Plan metadata:** `54c7fc82` (docs)

## Files Created/Modified

- `app/src/server/human-quality/corpus.ts` - Enums, validators, snapshot builder, privacy helpers
- `app/src/server/repositories/human-quality-corpus.ts` - Insert, list pending, submit evaluation
- `app/src/server/db/schema.ts` - Drizzle table definitions for corpus items and evaluations
- `app/drizzle/0043_human_quality_corpus.sql` - Migration with constraints and indexes
- `app/tests/unit/human-quality/human-quality-corpus.test.ts` - Contract and privacy regression tests
- `app/tests/unit/human-quality/human-quality-repository.test.ts` - Repository and isolation tests

## Decisions Made

- Reject forbidden keys at repository boundary via `sanitizeCorpusPayloads` rather than silently persisting sensitive fields
- Default invalid/missing cohort to `baseline` for conservative versioning
- Unique index on workspace + derivation + corpus_version for versioned comparisons

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 129-02 can build internal API routes on top of repository helpers
- Plan 129-03 can wire owner/feedback evaluation UI to pending queue and submit evaluation
- HUMAN-03 (structured evaluation form UX) remains for plans 02-03

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/corpus.ts
- FOUND: app/src/server/repositories/human-quality-corpus.ts
- FOUND: app/drizzle/0043_human_quality_corpus.sql
- FOUND: app/tests/unit/human-quality/human-quality-corpus.test.ts
- FOUND: app/tests/unit/human-quality/human-quality-repository.test.ts
- FOUND: 775253cd, f777d571, ff1cb79a

---
*Phase: 129-live-human-quality-corpus*
*Completed: 2026-06-17*
