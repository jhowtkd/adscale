---
phase: 46-hard-quality-gate
plan: "04"
subsystem: ai-pipeline
tags: [quality-gate, regeneration, creative-contract, QA-04]

requires:
  - phase: 46-hard-quality-gate
    plan: "03"
    provides: runCompletedDerivationQualityGate after scoring
provides:
  - buildHardFailureRegenerationSuggestion with contract-preserving tail
  - Regenerate API default feedback from stored or reconstructed suggestion
affects:
  - 46-05-PLAN (blocking actions already consume hardFailures)
  - Phase 47 workspace UX for regen copy

tech-stack:
  added: []
  patterns:
    - "Hard-failure regen text: codes + per-failure fixes + Phase 45 preservation tail"
    - "Regenerate without body.feedback uses parent.regenerationSuggestion"

key-files:
  created: []
  modified:
    - app/src/server/ai/creative-score.ts
    - app/src/server/ai/creative-quality-gate.ts
    - app/src/app/api/derivations/[id]/regenerate/route.ts
    - app/tests/unit/creative-score.test.ts
    - app/tests/unit/ai/creative-quality-gate-orchestration.test.ts
    - app/src/app/api/derivations/[id]/regenerate/route.test.ts

key-decisions:
  - "Empty hardFailures delegates entirely to buildRegenerationSuggestion"
  - "updateDerivationScore on gate passes full row score fields to avoid nulling qualityScore"
  - "Regenerate reconstructs suggestion from hardFailures only when stored suggestion is empty"

requirements-completed: [QA-04]

duration: 8min
completed: 2026-06-01
---

# Phase 46 Plan 04: Hard-Failure Regeneration Summary

**Invalid derivations now get structured regeneration suggestions listing hard-failure codes and contract-preserving fix guidance; regenerate without feedback forwards that text to child jobs.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-01T17:25:01Z
- **Completed:** 2026-06-01T17:33:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `buildHardFailureRegenerationSuggestion` outputs `Hard failures: [codes].`, per-code fix lines, and preservation tail (CTA semantics, format, mode, restyling asset IDs)
- Quality gate orchestration persists `regenerationSuggestion` when hard failures exist (orchestration test added)
- `POST .../regenerate` uses stored suggestion when `feedback` omitted; explicit user feedback unchanged; rebuilds from `hardFailures` when suggestion empty

## Task Commits

1. **Task 1 + Task 2 (combined)** - `546b831` (test message; includes implementation + route + tests)

## Files Created/Modified

- `app/src/server/ai/creative-score.ts` - `buildHardFailureRegenerationSuggestion`, `ctaTextFromContract`
- `app/src/server/ai/creative-quality-gate.ts` - persist suggestion via `updateDerivationScore` with full score row
- `app/src/app/api/derivations/[id]/regenerate/route.ts` - `resolveRegenerationFeedback`
- `app/tests/unit/creative-score.test.ts` - four builder behaviors
- `app/tests/unit/ai/creative-quality-gate-orchestration.test.ts` - regenerationSuggestion on invalid gate
- `app/src/app/api/derivations/[id]/regenerate/route.test.ts` - default vs explicit feedback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevent nulling qualityScore on partial score update**
- **Found during:** Task 1 wiring in quality gate
- **Issue:** `updateDerivationScore` only received `scoreStatus` + `regenerationSuggestion`, clearing `qualityScore`
- **Fix:** Pass `qualityScore`, `scoreBreakdown`, and `scoreIssues` from existing row
- **Files modified:** `app/src/server/ai/creative-quality-gate.ts`
- **Commit:** `546b831`

None otherwise — plan executed as written.

## Self-Check: PASSED

- FOUND: app/src/server/ai/creative-score.ts (buildHardFailureRegenerationSuggestion)
- FOUND: app/src/app/api/derivations/[id]/regenerate/route.ts (resolveRegenerationFeedback)
- FOUND: commit 546b831
- Tests: 598 passed, 1 skipped (`npm test`)

## TDD Gate Compliance

Single combined commit includes tests and implementation (RED/GREEN not split into separate commits). Tests cover all plan behaviors before ship.
