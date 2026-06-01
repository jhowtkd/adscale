---
phase: 46-hard-quality-gate
plan: "05"
subsystem: api
tags: [quality-gate, qa, 409, classifier]

requires:
  - phase: 46-hard-quality-gate
    provides: qualityVerdict/hardFailures persistence and classifier from plans 01-03
provides:
  - assertDerivationApprovable blocking guard for approve/save-reference/delivery-package
  - Manual POST /qa persists same quality gate fields as Inngest job
  - test-creatives QA evaluation via shared classifier
affects: [47-ui-quality-surface]

tech-stack:
  added: []
  patterns:
    - "409 derivationHardFailures with qualityVerdict + hardFailures in details"
    - "computeQualityGateFromAnalysis shared by job and manual QA"

key-files:
  created:
    - app/src/app/api/derivations/[id]/review/route.test.ts
  modified:
    - app/src/server/ai/creative-quality-gate.ts
    - app/src/app/api/derivations/[id]/review/route.ts
    - app/src/app/api/derivations/[id]/save-reference/route.ts
    - app/src/app/api/derivations/[id]/delivery-package/route.ts
    - app/src/app/api/derivations/[id]/qa/route.ts
    - app/src/app/api/derivations/[id]/qa/route.test.ts
    - app/scripts/test-creatives.ts
    - app/messages/en.json
    - app/messages/pt-BR.json

key-decisions:
  - "Block approve/save-reference/delivery when qualityVerdict is invalid OR hardFailures length > 0"
  - "Export routes unchanged — invalid outputs remain downloadable per product policy"
  - "Manual QA and test-creatives use classifyCreativeQualityGate + deriveQualityVerdict, not raw QA status alone"

patterns-established:
  - "assertDerivationApprovable returns structured block result consumed by apiError derivationHardFailures 409"

requirements-completed: [QA-01, QA-05]

duration: 4min
completed: 2026-06-01
---

# Phase 46 Plan 05: Blocking Actions and Unified QA Summary

**Approve, save-reference, and delivery-package return 409 on hard failures; manual QA and test-creatives share the production quality gate classifier.**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-06-01
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added `assertDerivationApprovable` and `computeQualityGateFromAnalysis` in `creative-quality-gate.ts`
- PATCH review, POST save-reference, and POST delivery-package return `derivationHardFailures` (409) when invalid
- POST `/qa` persists `qualityVerdict`, `hardFailures`, and `polishSuggestions` after analysis
- `test-creatives.ts` maps hard failure codes to `blockingIssues` via the shared classifier

## Task Commits

1. **Task 1: Shared assertDerivationApprovable + API 409 guards** - `0ea5e69` (feat)
2. **Task 2: Manual QA + test-creatives use classifier** - `ee5fab7` (feat)

## Files Created/Modified

- `app/src/server/ai/creative-quality-gate.ts` - Approvable guard + shared gate computation
- `app/src/app/api/derivations/[id]/review/route.ts` - Approve guard before status update
- `app/src/app/api/derivations/[id]/save-reference/route.ts` - Reference save guard
- `app/src/app/api/derivations/[id]/delivery-package/route.ts` - Delivery source guard
- `app/src/app/api/derivations/[id]/qa/route.ts` - Classifier after `analyzeCreativeQa`
- `app/scripts/test-creatives.ts` - QA quality evaluation via classifier
- Route and unit tests for review, save-reference, delivery-package, qa, and gate helpers

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- FOUND: app/src/app/api/derivations/[id]/review/route.test.ts
- FOUND: 0ea5e69
- FOUND: ee5fab7
- Tests: 598 passed (1 skipped)
