---
phase: 132-targeted-creative-quality-improvements
plan: "04"
subsystem: api
tags: [creative-quality, re-evaluation, evidence-cli, human-corpus, calibration]

requires:
  - phase: 132-02
    provides: accepted adjustments, archetype fixtures, RUBRIC_CALIBRATION_VERSION 1.1.0
  - phase: 132-03
    provides: regression guard checker and evidence template scaffold
provides:
  - failure-frequency before/after re-evaluation report engine
  - run-quality-improvement.ts CLI emitting 132-EVIDENCE.json
  - QUALITY-04 honesty gates in evidence checker
  - GET /api/feedback/quality-improvement
  - read-only Quality tab on HumanQualityCorpusPanel
affects:
  - phase-133-gate

tech-stack:
  added: []
  patterns:
    - "before arm: baseline|pre_learning cohort or selectedAt < improvementDeployedAt"
    - "after arm: post_learning cohort only"
    - "insufficient_sample nulls deltaRateByReason; factual metrics computed separately"
    - "fixtureMetrics compares baselineVerdict snapshot vs live gate classification"

key-files:
  created:
    - app/src/server/human-quality/improvement/reevaluate.ts
    - app/src/server/human-quality/improvement/service.ts
    - app/scripts/run-quality-improvement.ts
    - app/src/app/api/feedback/quality-improvement/route.ts
    - app/tests/unit/human-quality/improvement/reevaluate.test.ts
    - app/src/app/api/feedback/quality-improvement/route.test.ts
  modified:
    - app/scripts/check-quality-improvement-evidence.mjs
    - .planning/phases/132-targeted-creative-quality-improvements/132-EVIDENCE.template.json
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx

key-decisions:
  - "MIN_SLICE_SAMPLE (3) required per targeted reason in both arms before status ok"
  - "improvementDeployedAt defaults to earliest acceptedAt among accepted adjustments"
  - "Fixture before-arm pass rate uses baselineVerdict snapshot on targeted archetypes"
  - "Panel hides only when queue, calibration, impact, and quality all return 403"

patterns-established:
  - "QUALITY-04 checker rejects non-null deltas and improvementClaimed when insufficient_sample"
  - "Evidence template includes ok and insufficient_sample schema examples for CI validation"

requirements-completed: [QUALITY-04]

duration: 28min
completed: 2026-06-17
---

# Phase 132 Plan 04: Re-Evaluation Report, CLI, API and Quality Tab Summary

**Failure-frequency re-evaluation comparing human corpus before/after arms and fixture gate detection delta, with CLI evidence, QUALITY-04 honesty gates, and read-only Quality tab**

## Performance

- **Duration:** 28 min
- **Started:** 2026-06-17T14:32:00Z
- **Completed:** 2026-06-17T15:00:00Z
- **Tasks:** 4 (checkpoint auto-approved)
- **Files modified:** 11

## Accomplishments

- Built `buildQualityImprovementReport` with targeted visual failure-frequency before/after arms, factual separation, and fixture archetype pass rates
- Added `run-quality-improvement.ts` CLI and extended evidence checker with QUALITY-01..04 validation and honesty gates
- Shipped GET `/api/feedback/quality-improvement` and Quality tab on owner feedback panel with insufficient_sample messaging

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-evaluation engine and orchestrator** - `d9e4aba1` (feat)
2. **Task 2: CLI evidence and complete checker** - `d8e696e6` (feat)
3. **Task 3: Quality improvement API and UI tab** - `336909bd` (feat)
4. **Task 4: Verify quality improvement CLI and UI** - auto-approved (pre-checks passed)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `app/src/server/human-quality/improvement/reevaluate.ts` - failureRatesByReason, arm split, fixture pass rate, report builder
- `app/src/server/human-quality/improvement/service.ts` - runQualityImprovement orchestrator
- `app/scripts/run-quality-improvement.ts` - evidence CLI with regression metrics and requirements
- `app/scripts/check-quality-improvement-evidence.mjs` - QUALITY-04 visual/factual/fixture validation and honesty gates
- `.planning/phases/132-targeted-creative-quality-improvements/132-EVIDENCE.template.json` - ok + insufficient_sample examples
- `app/src/app/api/feedback/quality-improvement/route.ts` - platform-owner API with 100-row comparison cap
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` - Quality tab with failure frequency table

## Decisions Made

- Default `improvementDeployedAt` to earliest `acceptedAt` among accepted adjustments when not provided
- Require MIN_SLICE_SAMPLE per targeted reason in both arms before `status: ok`
- Use `baselineVerdict` snapshot for fixture before-arm; live `classifyCreativeQualityGate` for after-arm

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None.

## Checkpoint

**Task 4 (human-verify):** Auto-approved per user authorization ("aceitar e retomar"). Automated pre-checks passed:
- `npm test -- tests/unit/human-quality/improvement ... -t quality` (8 passed)
- `check-quality-improvement-evidence.mjs --skip-tests` on template (passed)

## Issues Encountered

- Full `npm test` reports 2 pre-existing failures in `OutputLearningRecommendationCard.test.tsx` (unrelated to Phase 132)
- `npm run build` fails on pre-existing type export in `impact/service.ts` (`LearningImpactReport` import from `./report`); Phase 132 files type-check clean

## Next Phase Readiness

- Phase 133 can run `run-quality-improvement.ts --run-regression` against live `132-EVIDENCE.json` after operator populates post_learning corpus
- Operator optional step: human-evaluate post-change derivations as `post_learning`, re-run CLI to populate after arm

---
*Phase: 132-targeted-creative-quality-improvements*
*Completed: 2026-06-17*

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/improvement/reevaluate.ts
- FOUND: app/src/server/human-quality/improvement/service.ts
- FOUND: app/scripts/run-quality-improvement.ts
- FOUND: app/src/app/api/feedback/quality-improvement/route.ts
- FOUND: .planning/phases/132-targeted-creative-quality-improvements/132-04-SUMMARY.md
- FOUND: d9e4aba1
- FOUND: d8e696e6
- FOUND: 336909bd
