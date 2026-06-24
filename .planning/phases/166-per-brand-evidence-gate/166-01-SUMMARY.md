---
phase: 166-per-brand-evidence-gate
plan: 01
subsystem: api
tags: [brand-taste, evidence-gate, claims-matrix, nextjs, vitest]

requires:
  - phase: 165-owner-calibration-panel
    provides: Profile route pattern, fixtureOnly detection, calibration-status-copy banner text
provides:
  - buildPerBrandEvidenceReport with brand-scoped claims matrix
  - buildMissingConditions PT-BR threshold gap messages
  - GET /api/admin/quality/brands/[clientProfileId]/evidence owner-only API
affects:
  - 166-02-PLAN (Evidência UI tab consumes evidence API)

tech-stack:
  added: []
  patterns:
    - Per-brand evidence report wrapping buildBrandTasteProfile + evaluateClaimsMatrix
    - Owner-gated brand GET mirroring profile route workspace scoping

key-files:
  created:
    - app/src/app/api/admin/quality/brands/[clientProfileId]/evidence/route.ts
    - app/src/app/api/admin/quality/brands/[clientProfileId]/evidence/route.test.ts
  modified:
    - app/src/server/brand-taste/calibration-evidence.ts
    - app/src/server/brand-taste/index.ts
    - app/tests/unit/brand-taste/calibration-evidence.test.ts

key-decisions:
  - "FIXTURE_ONLY_CAVEAT_PT duplicated server-side to match calibration-status-copy without UI import"
  - "withheldClaims filters claimsBlocked to customer_real_validation, commercial_quality_claim, validated_against_customer_real"

patterns-established:
  - "Per-brand evidence: profile → agreement → fixtureOnly → claims → missingConditions pipeline"
  - "Evidence API returns { report } envelope distinct from profile cache payload"

requirements-completed: [EVIDENCE-01, EVIDENCE-02, EVIDENCE-03, EVIDENCE-05]

duration: 3min
completed: 2026-06-24
---

# Phase 166 Plan 01: Per-Brand Evidence Server Summary

**Per-brand evidence report builder with brand-scoped claims matrix and owner-only GET .../evidence API**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-24T14:35:00Z
- **Completed:** 2026-06-24T14:38:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `buildPerBrandEvidenceReport` derives evidence level, claims, and missing conditions per `clientProfileId`
- `buildMissingConditions` emits PT-BR operator strings for seed, assisted, customer-real, and agreement gates
- Owner-only evidence API mirrors profile route auth and workspace scoping
- 13 tests pass covering fixture-only vs mixed-source withholding (EVIDENCE-05 server)

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: Per-brand evidence builder** — `75db3429` (test), `2b2ec46b` (feat)
2. **Task 2: Owner evidence read API** — `0bc5b584` (test), `e3b4bcac` (feat)

## Files Created/Modified

- `app/src/server/brand-taste/calibration-evidence.ts` — `PerBrandEvidenceReport`, `buildPerBrandEvidenceReport`, `buildMissingConditions`
- `app/src/server/brand-taste/index.ts` — exports new builder types and functions
- `app/tests/unit/brand-taste/calibration-evidence.test.ts` — 5 per-brand builder tests
- `app/src/app/api/admin/quality/brands/[clientProfileId]/evidence/route.ts` — owner-gated GET
- `app/src/app/api/admin/quality/brands/[clientProfileId]/evidence/route.test.ts` — 403/404/400/200 cases

## Decisions Made

- Duplicated FIXTURE_ONLY banner PT-BR string in server module to avoid importing from UI component layer
- `withheldClaims` is explicit subset of `claimsBlocked` for the three customer-real/commercial keys

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 (166-02) can consume `GET .../evidence` for Evidência tab UI (EVIDENCE-04)
- `buildPerBrandEvidenceReport` ready for `BrandEvidencePanel` integration

## Self-Check: PASSED

- FOUND: app/src/server/brand-taste/calibration-evidence.ts
- FOUND: app/src/app/api/admin/quality/brands/[clientProfileId]/evidence/route.ts
- FOUND: app/src/app/api/admin/quality/brands/[clientProfileId]/evidence/route.test.ts
- FOUND: 75db3429, 2b2ec46b, 0bc5b584, e3b4bcac

---
*Phase: 166-per-brand-evidence-gate*
*Completed: 2026-06-24*
