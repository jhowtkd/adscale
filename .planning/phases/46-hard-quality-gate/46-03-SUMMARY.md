---
phase: 46-hard-quality-gate
plan: "03"
subsystem: ai-pipeline
tags: [inngest, quality-gate, creative-qa, scoring]

requires:
  - phase: 46-hard-quality-gate
    plan: "01"
    provides: classifyCreativeQualityGate and deriveQualityVerdict
  - phase: 46-hard-quality-gate
    plan: "02"
    provides: updateDerivationQualityGate persistence
provides:
  - runCompletedDerivationQualityGate orchestration helper
  - quality-gate Inngest step after score-derivation
  - QA-03 score prompt contract violation surfacing in scoreIssues
affects:
  - 46-04-PLAN (regeneration from hard failures)
  - 46-05-PLAN (manual QA route reuse of helper)

tech-stack:
  added: []
  patterns:
    - "Automatic gate after scoring; job step failures are logged only"
    - "analyzeCreativeQa + classifier + updateDerivationQualityGate single path"

key-files:
  created:
    - app/tests/unit/ai/creative-quality-gate-orchestration.test.ts
  modified:
    - app/src/server/ai/creative-quality-gate.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/ai/creative-score.ts
    - app/src/server/jobs/derivation.test.ts
    - app/tests/integration/derivation-job.test.ts
    - app/tests/unit/ai/creative-score.test.ts

key-decisions:
  - "Gate step re-downloads output buffer for Inngest step isolation"
  - "QA checklist persisted on automatic run for Phase 47 without re-run"
  - "Gate analysis errors set improvable + empty hardFailures + qualityGatedAt"

requirements-completed: [QA-01, QA-03]

duration: 3min
completed: 2026-06-01
---

# Phase 46 Plan 03: Automatic Quality Gate in Derivation Job Summary

**Completed derivations now run analyzeCreativeQa and classify hard failures immediately after scoring; contract violations must appear in scoreIssues per updated vision prompt.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-01T17:17:24Z
- **Completed:** 2026-06-01T17:20:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `runCompletedDerivationQualityGate` calls QA, classifies, persists gate + QA fields; non-blocking improvable fallback on errors
- `quality-gate` Inngest step after `score-derivation` uses job `contract` and output re-download
- Scoring prompt requires contract violations in `scoreIssues` and forbids masking by high `visualQuality`
- 583 tests passing (584 total, 1 skipped)

## Task Commits

1. **Task 1: runCompletedDerivationQualityGate helper** - `64281b0` (feat)
2. **Task 2: Inngest quality-gate step + score prompt (QA-03)** - `e3349c7` (feat)

## Files Created/Modified

- `app/src/server/ai/creative-quality-gate.ts` - orchestration helper + module header
- `app/src/server/jobs/derivation.ts` - `quality-gate` step after scoring
- `app/src/server/ai/creative-score.ts` - CONTRACT VIOLATIONS IN scoreIssues prompt block
- `app/tests/unit/ai/creative-quality-gate-orchestration.test.ts` - invalid verdict + fallback tests
- `app/src/server/jobs/derivation.test.ts` - asserts quality-gate step invokes helper
- `app/tests/unit/ai/creative-score.test.ts` - prompt content assertion

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/src/server/ai/creative-quality-gate.ts
- FOUND: app/src/server/jobs/derivation.ts
- FOUND: app/tests/unit/ai/creative-quality-gate-orchestration.test.ts
- FOUND: commits 64281b0, e3349c7
