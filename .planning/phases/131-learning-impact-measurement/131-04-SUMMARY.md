---
phase: 131-learning-impact-measurement
plan: "04"
subsystem: api
tags: [human-quality, learning-impact, cli, evidence, react, nextjs, vitest]

requires:
  - phase: 131-learning-impact-measurement
    plan: "03"
    provides: runLearningImpact, LearningImpactReport with separated metric buckets and honesty gates
provides:
  - CLI evidence generation (run-learning-impact.ts) with global rollup and cohort filter
  - CI evidence checker with insufficient_sample honesty gates
  - GET /api/feedback/learning-impact with platform-owner/workspace-admin dual auth
  - Read-only Impact tab on HumanQualityCorpusPanel with separated metric sections
affects:
  - Phase 133 milestone evidence gate (131-EVIDENCE.json contract)
  - Operator audit of output-learning effectiveness

tech-stack:
  added: []
  patterns:
    - "Evidence CLI mirrors run-score-calibration.ts with --all-workspaces and --cohort flags"
    - "check-learning-impact-evidence.mjs rejects improvement claims when status insufficient_sample"
    - "Impact API reuses requireCalibrationAccess; caps drill-down rows at 100 with truncated flag"
    - "Panel hides only when queue, calibration, AND impact APIs all return 403"
    - "ImpactReportView renders intent/visual/factual buckets separately — no blended headline"

key-files:
  created:
    - app/scripts/run-learning-impact.ts
    - app/scripts/check-learning-impact-evidence.mjs
    - .planning/phases/131-learning-impact-measurement/131-EVIDENCE.template.json
    - app/src/app/api/feedback/learning-impact/route.ts
    - app/src/app/api/feedback/learning-impact/route.test.ts
  modified:
    - app/package.json
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx

key-decisions:
  - "Evidence template includes both ok and insufficient_sample example shapes for Phase 133 gate"
  - "API returns LearningImpactReport unchanged in metric structure; truncation only on drill-down rows"
  - "Insufficient-sample UX shows explicit message — no positive delta as headline"

patterns-established:
  - "npm script learning-impact-evidence runs checker with optional --skip-tests"
  - "Impact tab fetch keyed on workspaceId + cohortFilter via useQuery"
  - "131-EVIDENCE.template.json schemaVersion + learningImpactVersion contract for CI"

requirements-completed: [IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04]

duration: 25min
completed: 2026-06-17
---

# Phase 131 Plan 04: Evidence CLI, Impact API and Read-Only UI Tab Summary

**CLI evidence generation with CI honesty gates, dual-auth learning-impact API, and read-only Impact tab showing separated learned vs non-learned metrics with honest insufficient-sample UX.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-17T12:45:00Z
- **Completed:** 2026-06-17T13:10:00Z
- **Tasks:** 4
- **Files modified:** 9

## Accomplishments

- `run-learning-impact.ts` emits `131-EVIDENCE.json` with global multi-workspace rollup, cohort filter, and requirements array for Phase 133 gate precursor
- `check-learning-impact-evidence.mjs` validates separated metric buckets and rejects false improvement claims when `status === "insufficient_sample"`
- GET `/api/feedback/learning-impact` serves bounded `LearningImpactReport` with platform-owner global access and workspace-admin scoping
- HumanQualityCorpusPanel Impact tab renders learned vs non-learned arm table, intent/visual/factual sections, and explicit insufficient-sample messaging

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI evidence script and checker** - `89765eea` (feat)
2. **Task 2: Learning impact API with dual auth** - `c4b242df` (feat)
3. **Task 3: Impact tab on HumanQualityCorpusPanel** - `c9c8cd26` (feat)
4. **Task 4: Verify impact UI and CLI evidence** - checkpoint approved (no code commit; orchestrator verified 47 tests + evidence checker)

**Plan metadata:** `ba86372b` (docs: complete plan)

## Files Created/Modified

- `app/scripts/run-learning-impact.ts` - CLI calls `runLearningImpact`, writes evidence JSON with `verifiedAt` timestamp
- `app/scripts/check-learning-impact-evidence.mjs` - Schema validation, metric bucket separation, insufficient_sample honesty rules
- `.planning/phases/131-learning-impact-measurement/131-EVIDENCE.template.json` - ok and insufficient_sample example shapes for CI
- `app/src/app/api/feedback/learning-impact/route.ts` - GET handler with Zod query validation and row truncation
- `app/src/app/api/feedback/learning-impact/route.test.ts` - 403, global access, truncation tests
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` - Impact tab with `ImpactReportView` subcomponent
- `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` - Impact tab rendering and metric separation tests
- `app/package.json` - `learning-impact-evidence` npm script

## Decisions Made

- Reused `requireCalibrationAccess` for impact API auth (same dual auth as calibration per RESEARCH)
- Extended panel hide-when-forbidden logic to require all three APIs (queue, calibration, impact) return 403 before hiding
- Evidence checker optional `--skip-tests` flag for CI template validation without full test suite

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Checkpoint Verification

**Task 4 (human-verify):** Approved by operator after orchestrator automated pre-checks.

- `cd app && npm test -- tests/unit/human-quality/impact src/app/api/feedback/learning-impact src/components/feedback/HumanQualityCorpusPanel.test.tsx` — 47 tests passed (6 files)
- `node app/scripts/check-learning-impact-evidence.mjs --evidence .planning/phases/131-learning-impact-measurement/131-EVIDENCE.template.json --skip-tests` — passed

## Next Phase Readiness

- Phase 131 complete (4/4 plans): attribution → report → evidence → API → UI end-to-end
- `131-EVIDENCE.template.json` contract ready for Phase 133 milestone gate
- Live evidence generation requires staging DB with ≥5 evaluated corpus items and both learned/non-learned arms

## Self-Check: PASSED

- Key deliverable files exist (CLI, checker, API route, SUMMARY)
- Task commits verified: `89765eea`, `c4b242df`, `c9c8cd26`

---
*Phase: 131-learning-impact-measurement*
*Completed: 2026-06-17*
