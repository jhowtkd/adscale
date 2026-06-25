---
phase: 169-real-corpus-and-claim-gates
plan: 02
subsystem: api
tags: [human-quality, evidence, claim-gates, clientProfileId, vitest]

requires:
  - phase: 169-real-corpus-and-claim-gates
    plan: 01
    provides: Source-labeled promotion and operator_imported/real_customer intake
provides:
  - Active workspace/clientProfile scoped global evidence composition
  - Claim gates that block customer-real proof without real_customer rows in scope
  - Owner evidence route query params for scoped brand evaluation
  - Per-brand calibration isolation tests across mixed source labels
affects:
  - 169-real-corpus-and-claim-gates (plan 03 release evidence)

tech-stack:
  added: []
  patterns:
    - "fixtureOnly means zero real_customer in active scope, not synthetic-only"
    - "Evidence filters thread workspaceId/clientProfileId through progress, artifacts, sampling, and evaluated rows"
    - "operator_imported remains distinct from real_customer for claim unlock"

key-files:
  created: []
  modified:
    - app/src/server/repositories/human-quality-feedback-artifact.ts
    - app/src/server/human-quality/global-evidence-service.ts
    - app/src/server/human-quality/global-evidence.ts
    - app/src/server/human-quality/sampling/service.ts
    - app/src/server/human-quality/calibration/service.ts
    - app/src/server/human-quality/impact/service.ts
    - app/src/server/human-quality/improvement/service.ts
    - app/src/app/api/feedback/global-corpus-evidence/route.ts
    - app/tests/unit/human-quality/global-evidence.test.ts
    - app/src/app/api/feedback/global-corpus-evidence/route.test.ts
    - app/tests/unit/brand-taste/calibration-evidence.test.ts

key-decisions:
  - "fixtureOnly blocks validated_against_customer_real when active scope has zero real_customer rows"
  - "Sampling sub-services accept clientProfileId so scoped evidence does not fall back to global rows"
  - "Owner global evidence route validates workspaceId/clientProfileId as UUID query params"

patterns-established:
  - "Brand-level claims evaluate selected profile sufficiency; global reports may summarize scopes separately"

requirements-completed: [SOURCE-02, SOURCE-03, SOURCE-04]

duration: 18min
completed: 2026-06-25
---

# Phase 169 Plan 02: Active-Scope Claim Gates Summary

**Evidence source composition and customer-real claim gates scoped by workspace/clientProfile, with operator-only and fixture-only scopes blocked from unlocking validated_against_customer_real**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-25T08:13:00Z
- **Completed:** 2026-06-25T08:31:00Z
- **Tasks:** 4
- **Files modified:** 11

## Accomplishments

- Extended artifact source composition and global evidence service with optional `workspaceId` and `clientProfileId` filters
- Clarified claim semantics so `fixtureOnly` means no `real_customer` rows in the active scope (operator/synthetic do not unlock customer-real proof)
- Exposed scoped query params on the owner global evidence route with UUID validation
- Added per-brand isolation test proving another profile's real-customer sufficiency does not unlock claims for the selected profile

## Task Commits

1. **Task 1: Add active profile filters to evidence source composition** - `390a2e1b` (feat)
2. **Task 2: Strengthen claim evaluation semantics** - `af34127c` (feat)
3. **Task 3: Expose scoped evidence route parameters** - `dab1b931` (feat)
4. **Task 4: Prove per-brand calibration claim isolation** - `43f57981` (test)

## Files Created/Modified

- `app/src/server/repositories/human-quality-feedback-artifact.ts` - `clientProfileId` filter on source composition counts
- `app/src/server/human-quality/global-evidence-service.ts` - Scoped filters for progress, artifacts, coverage, evaluated rows
- `app/src/server/human-quality/global-evidence.ts` - Active-scope messaging for fixture-only claim blocks
- `app/src/server/human-quality/sampling/service.ts` - Pass `clientProfileId` into sampling sub-services
- `app/src/server/human-quality/calibration/service.ts` - Scoped evaluated-row queries
- `app/src/server/human-quality/impact/service.ts` - Scoped evaluated-row queries
- `app/src/server/human-quality/improvement/service.ts` - Scoped evaluated-row queries
- `app/src/app/api/feedback/global-corpus-evidence/route.ts` - Optional scoped query params
- `app/tests/unit/human-quality/global-evidence.test.ts` - Claim gate tests for source compositions
- `app/src/app/api/feedback/global-corpus-evidence/route.test.ts` - Route scope and validation tests
- `app/tests/unit/brand-taste/calibration-evidence.test.ts` - Mixed-profile isolation test

## Decisions Made

- Thread `clientProfileId` through sampling sub-services rather than silently using global rows when scope is requested
- Keep `operator_imported` visible in composition but never equivalent to `real_customer` for claim unlock
- Validate scoped route params as UUID strings consistent with other feedback API routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended sampling sub-services with clientProfileId**
- **Found during:** Task 1 (scoped evidence service)
- **Issue:** `runSampleCoverage` and calibration/impact/improvement services ignored `clientProfileId`, which would silently use global data for scoped requests
- **Fix:** Added optional `clientProfileId` to sampling service inputs and passed through to `listEvaluatedCorpusWithEvaluations`
- **Files modified:** `sampling/service.ts`, `calibration/service.ts`, `impact/service.ts`, `improvement/service.ts`
- **Verification:** Scoped evidence tests pass; no global fallback when profile filter is supplied
- **Committed in:** `390a2e1b`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for correct scoped claim evaluation; no product scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can wire release evidence using scoped composition and claim gates
- Owner route can request active-brand evidence via `workspaceId` + `clientProfileId` query params

## Self-Check: PASSED

- FOUND: `.planning/phases/169-real-corpus-and-claim-gates/169-02-SUMMARY.md`
- FOUND: `390a2e1b`
- FOUND: `af34127c`
- FOUND: `dab1b931`
- FOUND: `43f57981`

---
*Phase: 169-real-corpus-and-claim-gates*
*Completed: 2026-06-25*
