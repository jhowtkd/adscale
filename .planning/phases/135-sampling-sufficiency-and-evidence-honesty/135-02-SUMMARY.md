---
phase: 135-sampling-sufficiency-and-evidence-honesty
plan: "02"
subsystem: testing
tags: [evidence-honesty, sampleGuidance, evidenceSource, QA-23, SAMPLE-03]

requires:
  - phase: 135-01
    provides: SampleGuidance types and guidance builders on insufficient reports
provides:
  - evidenceSource tags on aggregate and child evidence JSON
  - Shared evidence-honesty validators in app/scripts/lib/evidence-honesty.mjs
  - Phase 135 sampling sufficiency evidence gate script
  - Child checker SAMPLE-03 constraints on calibration, impact, and quality evidence
affects: [135-03, 137]

tech-stack:
  added: []
  patterns:
    - "evidenceSource tags (live_human, fixture, accepted_caveat, technical_regression) on metric sections"
    - "sampleGuidance required when status is insufficient_corpus or insufficient_sample"
    - "reject improvement/movement claims when guidance additionalNeeded > 0"

key-files:
  created:
    - app/scripts/lib/evidence-honesty.mjs
    - app/scripts/check-sampling-sufficiency-evidence.mjs
    - app/tests/unit/human-quality/sampling/evidence-honesty.test.ts
    - .planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json
  modified:
    - app/scripts/check-real-quality-release-evidence.mjs
    - app/scripts/check-score-calibration-evidence.mjs
    - app/scripts/check-learning-impact-evidence.mjs
    - app/scripts/check-quality-improvement-evidence.mjs
    - app/scripts/run-score-calibration.ts
    - app/scripts/run-learning-impact.ts
    - app/scripts/run-quality-improvement.ts
    - app/src/server/human-quality/improvement/reevaluate.ts

key-decisions:
  - "Use short evidenceSource tags (live_human, fixture) per 135-RESEARCH Pattern 3, distinct from sampling/types.ts EvidenceSource enum"
  - "Extract shared honesty validators to app/scripts/lib/evidence-honesty.mjs for checker and vitest reuse"
  - "Phase 135 gate validates 135-EVIDENCE.template.json statically; runSampleCoverage CLI deferred to 135-03"

patterns-established:
  - "Producers must emit evidenceSource at CLI boundaries; checkers validate tags on read"
  - "Insufficient reports require non-empty sampleGuidance with additionalNeeded and blockedClaim"

requirements-completed: [SAMPLE-03]

duration: 18min
completed: 2026-06-17
---

# Phase 135 Plan 02: Evidence Source Separation and Honesty Checkers Summary

**evidenceSource tags and sampleGuidance gates on QA-23 aggregate, child phase evidence, and Phase 135 template — fixture metrics never share human corpus denominators**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-17T21:27:00Z
- **Completed:** 2026-06-17T21:31:00Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Extended QA-23 `validateMetricSeparation` to require `evidenceSource` on humanCorpus, fixtureValidation, and acceptedCaveats; aggregate builder tags buckets and blocks empty-corpus visual claims
- Wired `evidenceSource` and `denominatorNote` on calibration, impact, and quality evidence CLIs plus `fixtureMetrics` in reevaluate builder
- Hardened 130/131/132 checkers with sampleGuidance and evidenceSource rules; added `check-sampling-sufficiency-evidence.mjs` and `evidence-honesty.test.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: evidenceSource on aggregate and child evidence schemas** - `e6a9f2f8` (feat)
2. **Task 2: Wire evidenceSource on evidence producers** - `26017dbf` (feat)
3. **Task 3: Child evidence checkers + Phase 135 gate** - `c9dfaabe` (feat)

## Files Created/Modified

- `app/scripts/lib/evidence-honesty.mjs` - Shared SAMPLE-03 validators (evidenceSource, sampleGuidance, blocked-claim gates)
- `app/scripts/check-sampling-sufficiency-evidence.mjs` - Phase 135 evidence gate for 135-EVIDENCE.template.json
- `app/scripts/check-real-quality-release-evidence.mjs` - QA-23 evidenceSource enforcement on aggregate
- `app/scripts/check-score-calibration-evidence.mjs` - Calibration insufficient_corpus guidance + live_human tags
- `app/scripts/check-learning-impact-evidence.mjs` - Impact insufficient_sample guidance + live_human tags
- `app/scripts/check-quality-improvement-evidence.mjs` - Quality fixture/live_human tags + guidance gates
- `app/scripts/run-*.ts` (3) - Evidence producers emit tagged metric sections
- `app/src/server/human-quality/improvement/reevaluate.ts` - fixtureMetrics tagged fixture at report builder
- `app/tests/unit/human-quality/sampling/evidence-honesty.test.ts` - Child checker and template validation tests
- `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json` - Canonical Phase 135 honesty contract

## Decisions Made

- Short tag strings (`live_human`, `fixture`) used in evidence JSON per research; `sampling/types.ts` EvidenceSource enum unchanged for domain types
- Shared pure validators extracted to `evidence-honesty.mjs` so vitest imports checkers without running CLI main()
- Updated 130/131 templates and 132-EVIDENCE.json so existing `--skip-tests` CI paths remain green

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest import path from `sampling/` subdirectory required `../../../../scripts/` (four levels) — fixed before Task 3 commit

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SAMPLE-03 complete; Plan 135-03 can build operator coverage API consuming tagged evidence and sampleGuidance snapshots
- Phase 137 audit can reference `135-EVIDENCE.template.json` gates contract

## Self-Check: PASSED

- FOUND: app/scripts/lib/evidence-honesty.mjs
- FOUND: app/scripts/check-sampling-sufficiency-evidence.mjs
- FOUND: .planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-EVIDENCE.template.json
- FOUND: app/tests/unit/human-quality/sampling/evidence-honesty.test.ts
- FOUND: e6a9f2f8, 26017dbf, c9dfaabe

---
*Phase: 135-sampling-sufficiency-and-evidence-honesty*
*Completed: 2026-06-17*
