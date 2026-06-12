---
phase: 105-creative-hypotheses-and-variant-comparison
plan: 02
subsystem: performance-hypothesis-api
requires: [105-01]
provides: [hypothesis-crud-api, comparison-persistence]
key-files:
  created:
    - app/src/server/repositories/hypothesis.ts
    - app/src/server/performance/hypothesis/service.ts
    - app/src/server/performance/hypothesis/validation.ts
    - app/src/app/api/campaigns/[id]/hypotheses/route.ts
    - app/src/app/api/campaigns/[id]/hypotheses/[hypothesisId]/route.ts
    - app/src/app/api/campaigns/[id]/hypotheses/[hypothesisId]/compare/route.ts
    - app/src/app/api/campaigns/[id]/comparisons/route.ts
---

# Phase 105 Plan 02: Service and APIs Summary

**One-liner:** Campaign-scoped hypothesis CRUD, controlled and observational comparison endpoints with persisted reports.

## Deviations from Plan

None.

## Self-Check: PASSED
