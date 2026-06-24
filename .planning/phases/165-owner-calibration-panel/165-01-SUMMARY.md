---
phase: 165-owner-calibration-panel
plan: 01
subsystem: api
tags: [nextjs, vitest, drizzle, brand-taste, platform-owner]

requires:
  - phase: 162-per-brand-voice-configuration
    provides: voice inspect route pattern and requirePlatformOwner gate
  - phase: 163-corpus-learning-proposals
    provides: calibration signal and rule repositories
  - phase: 164-prompt-rule-application
    provides: buildBrandTasteProfile and mapRuleRowToCandidate
provides:
  - GET /api/admin/quality/brands cross-workspace brand list for owner combobox
  - GET .../profile taste profile via buildBrandTasteProfile with fixtureOnly helper
  - GET .../rules approved and candidate calibration rules grouped by status
affects:
  - 165-02-PLAN.md
  - 165-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Owner read API with server-resolved workspaceId from client_profiles PK"
    - "Vitest route tests mirroring voice/route.test.ts mock chains"

key-files:
  created:
    - app/src/app/api/admin/quality/brands/route.ts
    - app/src/app/api/admin/quality/brands/route.test.ts
    - app/src/app/api/admin/quality/brands/[clientProfileId]/profile/route.ts
    - app/src/app/api/admin/quality/brands/[clientProfileId]/profile/route.test.ts
    - app/src/app/api/admin/quality/brands/[clientProfileId]/rules/route.ts
    - app/src/app/api/admin/quality/brands/[clientProfileId]/rules/route.test.ts
  modified: []

key-decisions:
  - "Profile API adds fixtureOnly and corpusSignalsNote server-side for PANEL-04 without client evaluateClaimsMatrix import"
  - "Rules API fetches approved and candidate in parallel; rejected/deprecated excluded from panel payload"
  - "Brand list joins client_profiles to workspaces ordered by profile name asc"

patterns-established:
  - "Three owner-only GET routes under /api/admin/quality/brands with Zod UUID validation and 403/404/400 parity with voice route"

requirements-completed: [PANEL-01, PANEL-02, PANEL-05]

duration: 6min
completed: 2026-06-24
---

# Phase 165 Plan 01: Owner Read APIs Summary

**Owner-only GET APIs for cross-workspace brand list, per-brand taste profile (buildBrandTasteProfile), and calibration rules grouped by approved/candidate status**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-24T14:03:00Z
- **Completed:** 2026-06-24T14:09:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Platform owner can list all client profiles cross-workspace with workspace names for brand selector
- Taste profile endpoint reuses `listCalibrationSignalsForClientProfile` + `buildBrandTasteProfile` with `fixtureOnly` and `corpusSignalsNote` helpers
- Rules endpoint returns disjoint `approved` and `candidate` arrays via `mapRuleRowToCandidate`
- All three routes enforce `requirePlatformOwner`; 18 route tests pass (including existing voice route)

## Task Commits

Each task was committed atomically:

1. **Task 1: Owner brand list API** - `07269807` (feat)
2. **Task 2: Taste profile read API** - `0f83d48c` (feat)
3. **Task 3: Calibration rules read API** - `4a3e2cb7` (feat)

## Files Created/Modified

- `app/src/app/api/admin/quality/brands/route.ts` - Cross-workspace brand list for owner combobox
- `app/src/app/api/admin/quality/brands/route.test.ts` - Owner/403/empty list tests
- `app/src/app/api/admin/quality/brands/[clientProfileId]/profile/route.ts` - Taste profile read with helper fields
- `app/src/app/api/admin/quality/brands/[clientProfileId]/profile/route.test.ts` - Profile payload and gate tests
- `app/src/app/api/admin/quality/brands/[clientProfileId]/rules/route.ts` - Approved/candidate rules read
- `app/src/app/api/admin/quality/brands/[clientProfileId]/rules/route.test.ts` - Rules grouping and gate tests

## Decisions Made

- `corpusSignalsNote` uses PT-BR copy when `decisionCount === 0` per plan open-question resolution
- `fixtureOnly` computed as `real_customer === 0 && decisionCount > 0` for downstream PANEL-04 honesty banner
- Rules fetched with two parallel `listCalibrationRulesForClientProfile` calls filtered by status

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 165-02 can wire `OwnerCalibrationPanel` to these three endpoints plus existing voice route
- Brand combobox should call `GET /api/admin/quality/brands`
- Profile tab should consume `fixtureOnly` and `corpusSignalsNote` for honest status copy

## Self-Check: PASSED

- FOUND: app/src/app/api/admin/quality/brands/route.ts
- FOUND: app/src/app/api/admin/quality/brands/[clientProfileId]/profile/route.ts
- FOUND: app/src/app/api/admin/quality/brands/[clientProfileId]/rules/route.ts
- FOUND: commit 07269807
- FOUND: commit 0f83d48c
- FOUND: commit 4a3e2cb7

---
*Phase: 165-owner-calibration-panel*
*Completed: 2026-06-24*
