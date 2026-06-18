---
phase: 137-operational-quality-release-gate
plan: "03"
subsystem: testing
tags: [evidence, qalive, aggregation, regression, node-esm, vitest]

requires:
  - phase: 137-operational-quality-release-gate
    provides: 137-01 dual-status schema and QALIVE-02/03 checker
  - phase: 137-operational-quality-release-gate
    provides: 137-02 dual-block orchestrator
  - phase: 133-real-quality-release-gate
    provides: aggregateEvidence and runRegressionMode exports
provides:
  - aggregateOperationalEvidence merging 130-136 sourcePaths
  - --aggregate, --run-regression, --technical-only checker modes
  - sample-coverage-evidence and quality-trend-evidence npm scripts
  - 137-EVIDENCE.json live aggregation artifact
affects:
  - 137-04-milestone-audit

tech-stack:
  added: []
  patterns:
    - PHASE_EVIDENCE_V126 extends Phase 133 paths with 135/136 fallbacks
    - mergeRegressionIntoTechnical updates technicalRegression only (T-137-10)
    - deriveRootStatus encodes tech_debt when operational insufficient_sample

key-files:
  created:
    - .planning/phases/137-operational-quality-release-gate/137-EVIDENCE.json
  modified:
    - app/scripts/check-operational-quality-release-evidence.mjs
    - app/scripts/run-operational-quality-release-gate.mjs
    - app/package.json
    - app/tests/unit/release/operational-quality-release-evidence.test.ts

key-decisions:
  - "aggregateOperationalEvidence derives technicalRegression status from 133 regression metrics, not stale 137-EVIDENCE.json fail state"
  - "runRegressionMode merges only into technicalRegression; qualityImprovementClaimed stays false by default"
  - "Orchestrator appends operational-technical-regression step when --run-regression or OPERATIONAL_QUALITY_RUN_REGRESSION=1"

patterns-established:
  - "Operator refresh: sample-coverage-evidence and quality-trend-evidence npm aliases before gate aggregate"
  - "Milestone full regression: cd app && npm run operational-quality-release-gate -- --run-regression after live evidence refresh"

requirements-completed: [QALIVE-01, QALIVE-03]

duration: 16min
completed: 2026-06-18
---

# Phase 137 Plan 03: Live Aggregation + Regression + CLI Registration Summary

**v12.6 milestone evidence aggregates Phases 130-136 with sourcePath audit trails, delegates v12.3/v12.4 regression via Phase 133 runRegressionMode, and registers operator refresh npm scripts**

## Performance

- **Duration:** 16 min
- **Started:** 2026-06-18T12:10:00Z
- **Completed:** 2026-06-18T12:26:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Implemented `aggregateOperationalEvidence()` composing v12.5 core metrics with operational gates, sampleCoverage rollup, trendMetrics, and technicalRegression from 133 evidence
- Added `--aggregate`, `--run-regression`, and `--technical-only` CLI modes to operational checker with `mergeRegressionIntoTechnical` guard
- Wired orchestrator `--run-regression` / `OPERATIONAL_QUALITY_RUN_REGRESSION=1` to technical block regression step; optional `--aggregate` before operational checker
- Registered `sample-coverage-evidence` and `quality-trend-evidence` npm scripts for operator live corpus refresh
- Populated `137-EVIDENCE.json` from sub-phase files; 16 unit tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Live evidence aggregation from Phases 130–136** - `f9760ff7` (feat)
2. **Task 2: --run-regression, --technical-only, and npm script registration** - `98be4b16` (feat)

## Operator Refresh Commands

```bash
cd app && npm run sample-coverage-evidence -- --all-workspaces
cd app && npm run quality-trend-evidence -- --all-workspaces
cd app && npx tsx scripts/run-score-calibration.ts --all-workspaces
cd app && npx tsx scripts/run-learning-impact.ts --all-workspaces
cd app && npx tsx scripts/run-quality-improvement.ts --all-workspaces
node app/scripts/check-operational-quality-release-evidence.mjs --aggregate --skip-tests
cd app && npm run operational-quality-release-gate -- --run-regression
```

## Files Created/Modified

- `app/scripts/check-operational-quality-release-evidence.mjs` - aggregation, regression, technical-only modes
- `app/scripts/run-operational-quality-release-gate.mjs` - dynamic technical/operational step builders
- `app/package.json` - sample-coverage-evidence and quality-trend-evidence scripts
- `app/tests/unit/release/operational-quality-release-evidence.test.ts` - aggregate and runRegression unit tests
- `.planning/phases/137-operational-quality-release-gate/137-EVIDENCE.json` - aggregated milestone evidence

## Decisions Made

- Technical regression status on aggregate derives from 133 regressionMetrics, not preserved fail from prior gate runs
- Regression updates only `technicalRegression` section; operational gates and `qualityImprovementClaimed` remain independent
- 135/136 evidence falls back to templates when live JSON absent (expected until operator runs refresh CLIs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale technicalRegression fail status preserved on aggregate**
- **Found during:** Task 1 verification (`--aggregate --skip-tests`)
- **Issue:** Existing `137-EVIDENCE.json` with `technicalRegression.status: fail` caused QALIVE-02 failure after re-aggregate
- **Fix:** `buildTechnicalRegression` derives pass/fail from 133 regression metrics instead of preserving prior status
- **Files modified:** `app/scripts/check-operational-quality-release-evidence.mjs`
- **Committed in:** `f9760ff7`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required for honest re-aggregation; no scope creep.

## Issues Encountered

None beyond the stale-status bug above.

## User Setup Required

None - operator must run live evidence CLIs with `DATABASE_URL` before aggregate reflects live corpus (135/136 currently use template fallbacks).

## Next Phase Readiness

- Plan 137-04 can produce `v12.6-MILESTONE-AUDIT.md` using aggregated `137-EVIDENCE.json`
- Full gate still blocked at `technical:lint` per 137-02 deferred issue (pre-existing HumanQualityTrendTab lint)

## Self-Check: PASSED

- FOUND: `.planning/phases/137-operational-quality-release-gate/137-03-SUMMARY.md`
- FOUND: `app/scripts/check-operational-quality-release-evidence.mjs`
- FOUND: commit f9760ff7
- FOUND: commit 98be4b16

---
*Phase: 137-operational-quality-release-gate*
*Completed: 2026-06-18*
