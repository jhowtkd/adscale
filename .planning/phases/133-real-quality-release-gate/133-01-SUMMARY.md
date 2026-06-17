---
phase: 133-real-quality-release-gate
plan: "01"
subsystem: testing
tags: [nodejs, vitest, evidence, release-gate, qa-23, qa-24]

requires:
  - phase: 132-targeted-creative-quality-improvements
    provides: quality improvement evidence pattern, BLENDED_FIELD_DENYLIST, regression metrics separation
provides:
  - 133-EVIDENCE.template.json milestone schema with separated metric buckets
  - check-real-quality-release-evidence.mjs QA-23/24 validator with exported assertQa24
  - real-quality-release-evidence npm script for template validation
  - QA-24 Path A/B unit tests
affects:
  - 133-02 run-real-quality-release-gate orchestrator
  - 133-03 evidence aggregation and --run-regression
  - 133-04 milestone audit closure

tech-stack:
  added: []
  patterns:
    - "BLENDED_FIELD_DENYLIST at evidence root (reuse Phase 132)"
    - "assertQa24 dual-path: meanHumanVisualScore >= 75 OR accepted_gap with shrunk gap vs 70.17"
    - "Factual hard gates humanCorpusFactualPassRate and v12_3FactualFidelityRate === 1.0 with no caveat override"
    - "Cross-bucket field rules forbid misplaced meanHumanVisualScore, factualPassRate, globalVisualScoreDelta"

key-files:
  created:
    - .planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json
    - .planning/phases/133-real-quality-release-gate/133-BASELINE.md
    - .planning/phases/133-real-quality-release-gate/133-VERIFICATION.md
    - app/scripts/check-real-quality-release-evidence.mjs
    - app/tests/unit/release/real-quality-release-evidence.test.ts
  modified:
    - app/package.json

key-decisions:
  - "QA-24 primary metric is qualityMetrics.humanCorpus.meanHumanVisualScore — fixture meanQualityScore is reference only"
  - "accepted_gap caveat requires acceptedAt, rationale, and acceptedBy; gap must shrink vs priorBaseline default 70.17"
  - "learningImpactMetrics.insufficient_sample does not block QA-24 when visual path is satisfied"

patterns-established:
  - "REAL-QUALITY-RELEASE-EVIDENCE error prefix for checker output"
  - "validateMetricSeparation exported for unit tests alongside assertQa24"

requirements-completed: [QA-23, QA-24]

duration: 12min
completed: 2026-06-17
---

# Phase 133 Plan 01: Milestone Evidence Schema + QA-23/24 Checker Summary

**v12.5 milestone evidence contract with separated metric buckets and deterministic QA-24 pass logic (factual 1.0 hard gates + human visual target 75 or accepted_gap with shrunk gap vs 70.17).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-17T13:35:00Z
- **Completed:** 2026-06-17T13:47:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `133-EVIDENCE.template.json` defines `qualityMetrics`, `factualMetrics`, `learningImpactMetrics`, and `acceptedCaveats` with v12.5 schema
- `check-real-quality-release-evidence.mjs` enforces QA-23 separation (BLENDED_FIELD_DENYLIST + cross-bucket rules) and QA-24 Path A/B
- Ten unit tests cover factual hard fails, accepted_gap validation, and learning-impact non-blocking behavior
- `npm run real-quality-release-evidence` validates template without full gate orchestration
- Checker generates `133-BASELINE.md` (human vs fixture table) and `133-VERIFICATION.md` requirement rows

## Task Commits

Each task was committed atomically:

1. **Task 1: Milestone evidence template and checker skeleton** - `f9223241` (feat)
2. **Task 2 RED: QA-24 unit tests** - `eb0ed6b1` (test)
3. **Task 2 GREEN: QA-24 pass logic and npm script** - `bd52b2b6` (feat)

**Plan metadata:** pending (docs commit after this summary)

## Files Created/Modified

- `.planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json` — Milestone evidence schema contract
- `app/scripts/check-real-quality-release-evidence.mjs` — QA-23/24 validator with exported helpers
- `app/tests/unit/release/real-quality-release-evidence.test.ts` — Deterministic QA-24 Path A/B tests
- `app/package.json` — `real-quality-release-evidence` npm script
- `.planning/phases/133-real-quality-release-gate/133-BASELINE.md` — Generated human vs fixture baseline table
- `.planning/phases/133-real-quality-release-gate/133-VERIFICATION.md` — Generated QA-22–24 verification stub

## Decisions Made

- Cross-bucket rules allow `globalVisualScoreDelta` only in `learningImpactMetrics` (not in factual/quality buckets)
- Template uses Path B example with `currentValue: 72` so checker passes before live human corpus is populated
- `acceptedBy` required on `accepted_gap` caveats per threat model T-133-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cross-bucket validation rejected valid learningImpactMetrics.globalVisualScoreDelta**
- **Found during:** Task 1 (checker skeleton verification)
- **Issue:** Initial denylist blocked `globalVisualScoreDelta` inside `learningImpactMetrics` where it belongs per RESEARCH schema
- **Fix:** Replaced flat denylist with bucket-specific forbidden-field rules
- **Files modified:** `app/scripts/check-real-quality-release-evidence.mjs`
- **Committed in:** `f9223241` (Task 1 commit)

**2. [Rule 1 - Bug] writeBaseline function body orphaned after assertQa24 insert**
- **Found during:** Task 2 (vitest import parse failure)
- **Issue:** Search-replace removed `function writeBaseline(evidence) {` declaration
- **Fix:** Restored function declaration before baseline writer body
- **Files modified:** `app/scripts/check-real-quality-release-evidence.mjs`
- **Committed in:** `bd52b2b6` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for checker correctness; no scope creep.

## TDD Gate Compliance

- RED commit `eb0ed6b1` exists (tests fail before assertQa24)
- GREEN commit `bd52b2b6` exists (implementation passes all 10 tests)

## Issues Encountered

None beyond deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 133-02 can wire `run-real-quality-release-gate.mjs` to call this checker as final step
- Plan 133-03 can extend checker with `--aggregate` and `--run-regression` flags
- Template validates green via `npm run real-quality-release-evidence`

## Self-Check: PASSED

- FOUND: `.planning/phases/133-real-quality-release-gate/133-EVIDENCE.template.json`
- FOUND: `app/scripts/check-real-quality-release-evidence.mjs`
- FOUND: `app/tests/unit/release/real-quality-release-evidence.test.ts`
- FOUND: commit `f9223241`
- FOUND: commit `eb0ed6b1`
- FOUND: commit `bd52b2b6`

---
*Phase: 133-real-quality-release-gate*
*Completed: 2026-06-17*
