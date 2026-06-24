---
phase: 163-corpus-learning-proposals
plan: "01"
subsystem: api
tags: [corpus-learning, drizzle, vitest, human-quality]

requires: []
provides:
  - findSliceInCooldown and getApprovedCorpusQualityRuleForFailure repository helpers
  - evidenceRefs with artifactIds and fixtureOnly in aggregate
  - generate guards for cooldown and approved corpus_quality rules
affects:
  - 163-02-PLAN.md
  - 163-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Rejected-slice cooldown gate via findSliceInCooldown before insert"
    - "Approved corpus_quality rule skip unless MIN_SLICE_SAMPLE post-approval evals"
    - "fixtureOnly derived from sourceLabel join, not client JSON"

key-files:
  created:
    - app/tests/unit/human-quality/learning/client-learning-proposal-repository.test.ts
  modified:
    - app/src/server/repositories/client-learning-proposal.ts
    - app/src/server/repositories/calibration-rule.ts
    - app/src/server/repositories/human-quality-corpus.ts
    - app/src/server/repositories/human-quality-feedback-artifact.ts
    - app/src/server/human-quality/calibration/types.ts
    - app/src/server/human-quality/learning/aggregate.ts
    - app/src/server/human-quality/learning/generate.ts
    - app/tests/unit/human-quality/learning/aggregate.test.ts
    - app/tests/unit/human-quality/learning/generate.test.ts

key-decisions:
  - "Enrich rows with feedbackArtifactId in generate before aggregate to keep buildClientLearningProposals pure"
  - "Match approved rules via rationale prefix like cross-client.ts ({primaryFailureReason}:)"

patterns-established:
  - "Repository helpers tested with mocked db chain (human-quality-repository pattern)"
  - "Post-approval eval count uses sliceKey + evaluation.createdAt > rule.approvedAt"

requirements-completed: [LEARN-01, LEARN-02, LEARN-05]

duration: 5min
completed: 2026-06-24
---

# Phase 163 Plan 01: Aggregator Hardening Summary

**Cooldown and approved-rule gates on corpus learning proposals with complete evidenceRefs (artifactIds + fixtureOnly)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-24T08:43:00Z
- **Completed:** 2026-06-24T08:45:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `findSliceInCooldown` and `getApprovedCorpusQualityRuleForFailure` repository helpers with unit tests
- Extended evaluated corpus listing with `sourceLabel` join; aggregate emits `artifactIds` and `fixtureOnly` in evidenceRefs
- Generate skips inserts during reject cooldown or when approved corpus_quality rule lacks post-approval sample (≥3 evals)

## Task Commits

Each task was committed atomically:

1. **Task 1: Repository cooldown and approved-rule helpers** - `b07d3eb2` (feat)
2. **Task 2: Enrich aggregate evidence and generate guards** - `d5d974dd` (feat)
3. **Task 3: Unit tests for new aggregator behaviors** - `1b02ed17` (test)

## Files Created/Modified

- `app/src/server/repositories/client-learning-proposal.ts` - `findSliceInCooldown` for LEARN-05
- `app/src/server/repositories/calibration-rule.ts` - `getApprovedCorpusQualityRuleForFailure`
- `app/src/server/repositories/human-quality-corpus.ts` - sourceLabel join on evaluated corpus
- `app/src/server/repositories/human-quality-feedback-artifact.ts` - `listFeedbackArtifactIdsByCorpusItemIds`
- `app/src/server/human-quality/learning/aggregate.ts` - artifactIds and fixtureOnly in evidenceRefs
- `app/src/server/human-quality/learning/generate.ts` - cooldown + approved-rule gates before insert
- `app/tests/unit/human-quality/learning/client-learning-proposal-repository.test.ts` - repository unit tests
- `app/tests/unit/human-quality/learning/aggregate.test.ts` - fixtureOnly and artifactIds cases
- `app/tests/unit/human-quality/learning/generate.test.ts` - cooldown and approved-rule cases

## Decisions Made

- Feedback artifact IDs are fetched in `generate.ts` and passed on rows rather than making aggregate async
- Approved rule matching uses `like(rationale, '{reason}:%')` consistent with cross-client rationale prefix convention

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock new repository deps in generate.test.ts**
- **Found during:** Task 2 (Enrich aggregate evidence and generate guards)
- **Issue:** Existing generate tests hit real DB via `listFeedbackArtifactIdsByCorpusItemIds`
- **Fix:** Added vi.mock for feedback-artifact, calibration-rule, and findSliceInCooldown
- **Files modified:** app/tests/unit/human-quality/learning/generate.test.ts
- **Verification:** `npm test -- --run tests/unit/human-quality/learning/` passes (34 tests)
- **Committed in:** d5d974dd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for test isolation; no scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Aggregator hardening complete; plans 163-02 and 163-03 can build on guarded generate path
- All 34 learning unit tests pass

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/learning/generate.ts
- FOUND: app/tests/unit/human-quality/learning/client-learning-proposal-repository.test.ts
- FOUND: b07d3eb2
- FOUND: d5d974dd
- FOUND: 1b02ed17

---
*Phase: 163-corpus-learning-proposals*
*Completed: 2026-06-24*
