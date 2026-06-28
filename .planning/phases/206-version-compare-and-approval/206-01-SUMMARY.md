---
phase: 206-version-compare-and-approval
plan: "01"
subsystem: api
tags: [zod, nextjs, artifact-versioning, semantic-diff, object-storage]
requires:
  - phase: 203-artifact-version-foundation
    provides: immutable scoped versions, lineage heads, and strict snapshot contracts
  - phase: 204-plan-iteration-loop
    provides: server-owned plan semantic changes and confirmed proposal provenance
provides:
  - Strict sanitized plan and creative comparison DTOs
  - Duplicate-safe order-aware plan comparison in canonical field order
  - Authenticated read-only same-lineage comparison endpoint
  - Independent read-time creative preview resolution with persisted intent
affects: [206-02-promotion-domain, 206-03-comparison-ui, 207-iterative-copilot-integration]
tech-stack:
  added: []
  patterns: [positive-allowlist comparison DTO, scoped read-only presenter, response-only signed URLs]
key-files:
  created:
    - app/src/server/assistant/artifact-version/comparison.ts
    - app/src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.ts
  modified:
    - app/src/lib/assistant/artifact-version.ts
    - app/src/server/assistant/plan-iteration/diff.ts
key-decisions:
  - "Comparison responses use a strict positive allowlist separate from persisted version snapshots."
  - "Plan list comparison uses occurrence-aware matching over schema-bounded lists so duplicates and moves remain deterministic."
  - "Creative intent resolves only from confirmed persisted proposals, with persisted feedback as the safe fallback."
patterns-established:
  - "Comparison derives all four scope dimensions from the authenticated persisted thread."
  - "Each creative preview signs independently and preserves metadata on failure."
requirements-completed: [COMP-01, COMP-02]
duration: 25min
completed: 2026-06-28
---

# Phase 206 Plan 01: Version Comparison Contract Summary

**Scoped read-only plan and creative comparisons with order-aware semantic changes, sanitized metadata, and independently recoverable signed previews**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-28T17:07:48Z
- **Completed:** 2026-06-28T17:32:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added strict plan/creative comparison read models that exclude output keys, derivation/provider payloads, prompts, and provenance IDs.
- Replaced sorted list normalization with canonical-order, duplicate-safe add/remove/edit/move/unchanged comparison.
- Added a thread-scoped compare route that validates one lineage and two distinct versions without writing heads, statuses, or proposals.
- Resolved creative dimensions, plan labels, confirmed revision intent, and short-lived preview URLs at response time; one preview failure does not block the other.

## Task Commits

1. **Task 1 RED: Comparison contract cases** - `ab18fdbc` (test)
2. **Task 1 GREEN: Safe order-aware comparisons** - `fa0ddde0` (feat)
3. **Task 2 RED: Scoped presenter and route cases** - `dd564e18` (test)
4. **Task 2 GREEN: Scoped sanitized comparison API** - `4a14af42` (feat)

## Files Created/Modified

- `app/src/lib/assistant/artifact-version.ts` - strict comparison-only response schemas.
- `app/src/server/assistant/plan-iteration/diff.ts` - occurrence-aware semantic comparator and compatible Phase 204 summaries.
- `app/src/server/assistant/artifact-version/comparison.ts` - scoped plan/creative comparison presenter.
- `app/src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.ts` - authenticated strict POST endpoint.
- Focused comparator, presenter, and route tests cover ordering, duplicates, sanitization, scope, and preview recovery.

## Decisions Made

- Kept persisted snapshot contracts unchanged; comparison has its own strict response-only schema.
- Kept the existing `buildPlanSemanticChanges` summary interface for Phase 204 callers and added detailed comparison alongside it.
- Used the existing object-storage signer and format helper; no dependency or generic diff framework was added.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 206-02 can bind promotion and conflict handling to `headRevision` and the sanitized selected-version context. The UI plan can render canonical plan fields and resilient creative previews without accessing persisted internals.

## Self-Check: PASSED

- All seven created/modified files exist.
- All four TDD task commits exist.
- Exact focused verification passes: 17 tests and TypeScript with no errors.

---
*Phase: 206-version-compare-and-approval*
*Completed: 2026-06-28*
