---
phase: 133-real-quality-release-gate
plan: "02"
subsystem: testing
tags: [nodejs, vitest, release-gate, qa-22, evidence]

requires:
  - phase: 133-real-quality-release-gate
    provides: check-real-quality-release-evidence.mjs and 133-EVIDENCE.template.json from Plan 01
provides:
  - run-real-quality-release-gate.mjs QA-22 orchestrator with 14-step matrix
  - real-quality-release-gate npm script with --dry-run support
  - 133-EVIDENCE.json populated automated section from live gate run
affects:
  - 133-03 evidence aggregation and --run-regression
  - 133-04 milestone audit closure

tech-stack:
  added: []
  patterns:
    - "Sequential vitest subsets before full npm test/lint/build"
    - "Sub-phase evidence checkers invoked with --skip-tests"
    - "writeAutomatedStep updates 133-EVIDENCE.json per passing step"
    - "--dry-run logs step matrix without execFileSync"

key-files:
  created:
    - app/scripts/run-real-quality-release-gate.mjs
    - .planning/phases/133-real-quality-release-gate/133-EVIDENCE.json
  modified:
    - app/package.json
    - app/src/components/campaigns/OutputLearningRecommendationCard.test.tsx
    - app/src/app/api/feedback/human-quality-corpus/route.test.ts
    - app/src/server/human-quality/impact/service.ts
    - app/src/server/human-quality/improvement/types.ts

key-decisions:
  - "Quality-improvement vitest subset uses reevaluate/apply/accept + corpus-fixtures archetype tests"
  - "Sub-checkers use template evidence paths; final step validates 133-EVIDENCE.json"
  - "No --run-regression on sub-checkers in this plan (deferred to 133-03)"

patterns-established:
  - "14-step QA-22 matrix mirroring run-output-learning-release-gate with sub-phase composition"
  - "finalizeEvidence sets QA-22 requirement pass and verifiedAt after all steps green"

requirements-completed: [QA-22]

duration: 28min
completed: 2026-06-17
---

# Phase 133 Plan 02: Real Quality Release Gate Orchestrator Summary

**QA-22 single-command orchestrator composing corpus/calibration/impact/improvement vitest subsets, sub-phase evidence checkers, full test/lint/build, and Phase 133 evidence validation with dry-run support.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-06-17T16:38:00Z
- **Completed:** 2026-06-17T16:46:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `run-real-quality-release-gate.mjs` with full 14-step QA-22 matrix and `--dry-run` mode
- Registered `real-quality-release-gate` npm script forwarding `--dry-run` via `npm run ... -- --dry-run`
- Live gate run populated `133-EVIDENCE.json` with all automated steps `pass` and QA-22 requirement `pass`
- QA-24 passes via template `accepted_gap` caveat (meanHumanVisualScore null, shrunk gap vs 70.17)

## Task Commits

1. **Task 1: Release gate orchestrator with QA-22 step matrix** - `bb7afac4` (feat)
2. **Task 2: npm script and live dry-run execution** - `5838d39a` (feat)

## Files Created/Modified

- `app/scripts/run-real-quality-release-gate.mjs` - QA-22 orchestrator with writeAutomatedStep and finalizeEvidence
- `app/package.json` - `real-quality-release-gate` npm script
- `.planning/phases/133-real-quality-release-gate/133-EVIDENCE.json` - Live gate evidence with automated pass markers

## Decisions Made

- Quality-improvement focused tests include `corpus-fixtures.test.ts` for archetype coverage (per RESEARCH)
- Sub-checkers run against phase template JSON paths; orchestrator copies `133-EVIDENCE.template.json` on first run if missing
- `--run-regression` intentionally omitted from sub-checkers (Plan 133-03 scope)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale OutputLearningRecommendationCard test expectations**
- **Found during:** Task 2 (full gate `unit` step)
- **Issue:** Test used `trace-1` (invalid `ol-` prefix) and old `onAccept({ recipeId, config })` shape
- **Fix:** Updated fixture traceId to `ol-trace-1` and expect `{ prefill, applicationSnapshot }`
- **Files modified:** `app/src/components/campaigns/OutputLearningRecommendationCard.test.tsx`
- **Committed in:** `5838d39a`

**2. [Rule 3 - Blocking] Missing db/r2 mocks in corpus queue route test**
- **Found during:** Task 2 (full gate `unit` step)
- **Issue:** GET handler calls `attachPreviewImages` which queries db without mocks
- **Fix:** Mock `@/server/db` select chain and `@/server/storage/r2` presigned URL
- **Files modified:** `app/src/app/api/feedback/human-quality-corpus/route.test.ts`
- **Committed in:** `5838d39a`

**3. [Rule 1 - Bug] LearningImpactReport import from wrong module**
- **Found during:** Task 2 (full gate `build` step)
- **Issue:** `service.ts` imported `LearningImpactReport` from `./report` but type lives in `./types`
- **Fix:** Import type from `./types` and re-export from there
- **Files modified:** `app/src/server/human-quality/impact/service.ts`
- **Committed in:** `5838d39a`

**4. [Rule 1 - Bug] Wrong corpus import path in improvement types**
- **Found during:** Task 2 (full gate `build` step)
- **Issue:** `improvement/types.ts` used `../../corpus` (nonexistent path)
- **Fix:** Corrected to `../corpus`
- **Files modified:** `app/src/server/human-quality/improvement/types.ts`
- **Committed in:** `5838d39a`

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs)
**Impact on plan:** All fixes required for gate steps 11–13 to pass. No scope creep beyond enabling QA-22 command matrix.

## Issues Encountered

- First full gate run failed at `unit` (2 pre-existing test failures) and `build` (2 type errors); resolved via deviation fixes above
- QA-24 on template evidence passes with `accepted_gap` — expected operator caveat before live human corpus

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 133-03 can wire `--run-regression` / `--factual-only` into checker and evidence aggregation
- `cd app && npm run real-quality-release-gate` is green on template evidence
- `cd app && npm run real-quality-release-gate -- --dry-run` lists all 14 steps

## Self-Check: PASSED

- FOUND: app/scripts/run-real-quality-release-gate.mjs
- FOUND: .planning/phases/133-real-quality-release-gate/133-EVIDENCE.json
- FOUND: bb7afac4 (git log confirms)
- FOUND: 5838d39a (git log confirms)

---
*Phase: 133-real-quality-release-gate*
*Completed: 2026-06-17*
