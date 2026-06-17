---
phase: 130-score-calibration-and-rubric-alignment
plan: "04"
subsystem: api
tags: [calibration, evidence, human-quality, vitest, nextjs]

requires:
  - phase: 130-score-calibration-and-rubric-alignment
    provides: runScoreCalibration service, CalibrationReport schema, adjustment proposals
provides:
  - CLI evidence generation (run-score-calibration.ts)
  - CI evidence checker (check-score-calibration-evidence.mjs)
  - GET /api/feedback/score-calibration with dual auth
  - Read-only Calibration tab on HumanQualityCorpusPanel
affects: [133-milestone-release-gate, phase-131, phase-132]

tech-stack:
  added: []
  patterns:
    - "Phase 128-style evidence JSON with visualMetrics/factualMetrics separation"
    - "Dual auth: platform-owner OR workspace admin for calibration access"
    - "API comparisons capped at 100 with truncated flag"

key-files:
  created:
    - app/scripts/run-score-calibration.ts
    - app/scripts/check-score-calibration-evidence.mjs
    - .planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.template.json
    - app/src/server/auth/calibration-access.ts
    - app/src/app/api/feedback/score-calibration/route.ts
    - app/src/app/api/feedback/score-calibration/route.test.ts
  modified:
    - app/package.json
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx

key-decisions:
  - "Panel hides only when both queue and calibration APIs return 403"
  - "Workspace admin global rollup allowed via default workspace membership check"
  - "Evidence template embeds insufficient_corpus example under _schemaExamples"

patterns-established:
  - "score-calibration-evidence npm script wraps check-score-calibration-evidence.mjs"
  - "Calibration tab is read-only; evaluation remains on Queue tab"

requirements-completed: [CALIB-01, CALIB-02, CALIB-03, CALIB-04]

duration: 8min
completed: 2026-06-17
---

# Phase 130 Plan 04: Evidence CLI, Calibration API and Read-Only UI Tab Summary

**CLI evidence generation, CI schema checker, dual-auth calibration API, and read-only Calibration tab completing end-to-end CALIB-01–04 audit surface**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-17T11:38:00Z
- **Completed:** 2026-06-17T11:46:19Z
- **Tasks:** 4 (3 auto + 1 checkpoint auto-approved)
- **Files modified:** 10

## Accomplishments

- `run-score-calibration.ts` emits milestone evidence JSON with global rollup, cohort filter, and `verifiedAt`
- `check-score-calibration-evidence.mjs` validates schema separation and CALIB-01–04 requirements mapping
- GET `/api/feedback/score-calibration` serves bounded reports to platform-owner and workspace admin
- HumanQualityCorpusPanel Calibration tab shows MAE, signed bias, slice tables, per-item drill-down, and proposed adjustments

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI evidence script and checker** - `9f447d18` (feat)
2. **Task 2: Calibration API with dual auth** - `ae1f8567` (test RED), `6a2ccdf9` (feat GREEN)
3. **Task 3: Read-only calibration tab** - `4a1dcbe4` (test RED), `7a34fc04` (feat GREEN)

**Checkpoint:** Auto-approved — 56 tests green, evidence checker passed, lint/build succeeded

## Files Created/Modified

- `app/scripts/run-score-calibration.ts` — CLI writes 130-EVIDENCE.json from `runScoreCalibration`
- `app/scripts/check-score-calibration-evidence.mjs` — CI validator rejecting blended metrics
- `.planning/phases/130-score-calibration-and-rubric-alignment/130-EVIDENCE.template.json` — ok + insufficient_corpus schema contract
- `app/src/server/auth/calibration-access.ts` — platform-owner or workspace admin gate
- `app/src/app/api/feedback/score-calibration/route.ts` — GET with 100-item comparison cap
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` — Queue + Calibration tabs

## Decisions Made

- Panel remains hidden only when both corpus queue and calibration APIs deny access
- Workspace admins authenticate via default workspace owner/admin role for global rollup
- Evidence template documents insufficient_corpus shape under `_schemaExamples` for CI without breaking primary validation

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None.

## TDD Gate Compliance

- RED commits present: `ae1f8567`, `4a1dcbe4`
- GREEN commits present: `6a2ccdf9`, `7a34fc04`
- Gate sequence valid

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 130 complete — all four plans shipped
- Phase 131 (learning impact) and Phase 132 (apply rubric proposals) can consume calibration evidence
- Phase 133 release gate can reference `130-EVIDENCE.template.json` schema

---
*Phase: 130-score-calibration-and-rubric-alignment*
*Completed: 2026-06-17*

## Self-Check: PASSED

- All key files found on disk
- Commits verified via `git rev-parse`: 9f447d18, ae1f8567, 6a2ccdf9, 4a1dcbe4, 7a34fc04
