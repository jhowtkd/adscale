---
phase: 137-operational-quality-release-gate
plan: "01"
subsystem: testing
tags: [evidence, qalive, release-gate, vitest, node-esm]

requires:
  - phase: 133-real-quality-release-gate
    provides: BLENDED_FIELD_DENYLIST, v12.5 regression patterns
  - phase: 135-sampling-sufficiency-and-evidence-honesty
    provides: evidence-honesty.mjs, sampleGuidance contract
provides:
  - v12.6 137-EVIDENCE.template.json dual-status schema
  - check-operational-quality-release-evidence.mjs with assertQalive02/03
  - operational-quality-release-evidence npm script
  - QALIVE-02/03 unit test suite
affects:
  - 137-02-operational-orchestrator
  - 137-03-live-aggregation
  - 137-04-milestone-audit

tech-stack:
  added: []
  patterns:
    - Dual top-level technicalRegression + operationalEvidence sections
    - QALIVE-03 qualityImprovementClaimed boolean gate with rejectClaimsWhenGuidanceBlocked

key-files:
  created:
    - .planning/phases/137-operational-quality-release-gate/137-EVIDENCE.template.json
    - .planning/phases/137-operational-quality-release-gate/137-BASELINE.md
    - .planning/phases/137-operational-quality-release-gate/137-VERIFICATION.md
    - app/scripts/check-operational-quality-release-evidence.mjs
    - app/tests/unit/release/operational-quality-release-evidence.test.ts
  modified:
    - app/scripts/check-real-quality-release-evidence.mjs
    - app/package.json

key-decisions:
  - "Exported BLENDED_FIELD_DENYLIST from Phase 133 checker instead of duplicating denylist"
  - "Root status tech_debt with technical pass + operational insufficient_sample is valid per QALIVE-02"
  - "qualityImprovementClaimed defaults false; QALIVE-03 blocks true when sample or factual gates fail"

patterns-established:
  - "Operational blended denylist extends Phase 133 with milestonePass and overallOperationalPass"
  - "assertQalive03 uses rejectClaimsWhenGuidanceBlocked on qualityImprovement gate movement paths"

requirements-completed: [QALIVE-02, QALIVE-03]

duration: 18min
completed: 2026-06-18
---

# Phase 137 Plan 01: Operational Evidence Schema + QALIVE-02/03 Checker Summary

**v12.6 milestone evidence contract with dual technical/operational status sections and deterministic QALIVE-02/03 checker plus npm script**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-18T11:28:00Z
- **Completed:** 2026-06-18T11:46:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created `137-EVIDENCE.template.json` with separate `technicalRegression` and `operationalEvidence` top-level sections, metric buckets, and QALIVE requirement rows
- Implemented `check-operational-quality-release-evidence.mjs` with `assertQalive02`, `assertQalive03`, blended-field rejection, and baseline/verification writers
- Added 11 unit tests covering dual-status independence, claim gates, and denylist enforcement
- Registered `operational-quality-release-evidence` npm script; template validates with `--skip-tests`

## Task Commits

Each task was committed atomically:

1. **Task 1: Operational evidence template and checker skeleton** - `ec79c381` (feat)
2. **Task 2: QALIVE-03 claim logic and unit tests** - `113693d5` (test), `d84d0ae3` (feat)

## Files Created/Modified

- `.planning/phases/137-operational-quality-release-gate/137-EVIDENCE.template.json` - v12.6 dual-status evidence schema stub
- `app/scripts/check-operational-quality-release-evidence.mjs` - QALIVE-02/03 validator CLI
- `app/scripts/check-real-quality-release-evidence.mjs` - exports `BLENDED_FIELD_DENYLIST` for reuse
- `app/tests/unit/release/operational-quality-release-evidence.test.ts` - deterministic QALIVE unit tests
- `app/package.json` - `operational-quality-release-evidence` script
- `.planning/phases/137-operational-quality-release-gate/137-BASELINE.md` - technical vs operational status table
- `.planning/phases/137-operational-quality-release-gate/137-VERIFICATION.md` - requirement verification rows

## Decisions Made

- Reused Phase 133 `BLENDED_FIELD_DENYLIST` export rather than maintaining a duplicate denylist
- Template root `status: tech_debt` reflects technical pass with zero live corpus evaluations
- `assertQalive03` checks factual rate and sample guidance only when `qualityImprovementClaimed === true`

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Task 2 was marked `tdd="true"`. The test commit (`113693d5`) follows the feat commit that introduced `assertQalive03` in the checker skeleton (`ec79c381`). All 11 tests pass on first run — implementation and tests landed in the same execution window. Future plans should land RED tests before GREEN implementation commits.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 137-02 can wire `run-operational-quality-release-gate.mjs` orchestrator using this checker
- `--aggregate`, `--run-regression`, and `--technical-only` intentionally deferred to Plans 137-02/03

## Self-Check: PASSED

- FOUND: `.planning/phases/137-operational-quality-release-gate/137-EVIDENCE.template.json`
- FOUND: `app/scripts/check-operational-quality-release-evidence.mjs`
- FOUND: `app/tests/unit/release/operational-quality-release-evidence.test.ts`
- FOUND: commit ec79c381
- FOUND: commit 113693d5
- FOUND: commit d84d0ae3

---
*Phase: 137-operational-quality-release-gate*
*Completed: 2026-06-18*
