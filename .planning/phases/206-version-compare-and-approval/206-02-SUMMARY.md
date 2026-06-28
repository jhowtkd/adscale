---
phase: 206-version-compare-and-approval
plan: "02"
subsystem: database, api
tags: [postgres, drizzle, zod, cas, transactions, artifact-versioning]
requires:
  - phase: 203-artifact-version-foundation
    provides: immutable scoped versions, lineage heads, proposal lifecycle, and revision CAS
  - phase: 206-version-compare-and-approval
    plan: "01"
    provides: sanitized comparison state and exact head revisions
provides:
  - Scoped append-only approval history and revision-bound comparison acknowledgements
  - Atomic plan and creative promotion with canonical synchronization and proposal staling
  - Strict acknowledgement and promotion APIs with non-retrying 409 recovery
affects: [206-03-history-ui, 206-04-comparison-workspace, 207-iterative-copilot-uat]
tech-stack:
  added: []
  patterns: [single multi-table promotion transaction, operation-lineage idempotency, revision-bound review receipt]
key-files:
  created:
    - app/drizzle/0067_assistant_artifact_approvals.sql
    - app/src/server/assistant/artifact-version/promotion.ts
    - app/src/app/api/assistant/threads/[threadId]/artifact-versions/comparison-acknowledgements/route.ts
    - app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.ts
  modified:
    - app/src/lib/assistant/artifact-version.ts
    - app/src/server/db/schema.ts
    - app/src/server/repositories/artifact-version.ts
key-decisions:
  - "Promotion re-reads scope, lineage, target, head, canonical rows, and acknowledgement inside one database transaction."
  - "Every changed head binds both expected official version and expected revision; conflicts never retry automatically."
  - "Successful compound operations append one approval event per lineage under one operation ID and never call billing."
patterns-established:
  - "Canonical plan sync writes creative_plans and campaigns.constraints in the same transaction as the head CAS."
  - "Creative promotion demotes only the previous official snapshot derivation and preserves every immutable version."
requirements-completed: [APPR-01, APPR-02, APPR-03]
duration: 18min
completed: 2026-06-28
---

# Phase 206 Plan 02: Atomic Artifact Promotion Summary

**Revision-safe no-credit plan and creative promotion with append-only history, server-verifiable linked-plan review, and all-or-nothing canonical writes**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-28T17:37:11Z
- **Completed:** 2026-06-28T17:54:43Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added migration 0067 with scoped approval events and exact revision-bound linked-plan comparison acknowledgements.
- Added one transaction for single/compound promotion covering both head CAS operations, canonical plan/campaign/derivation writes, proposal staling, and approval events.
- Added strict authenticated acknowledgement and promotion routes with safe zero-credit results and refreshed non-retrying 409 state.
- Added test-database transaction coverage proving successful compound commit, idempotent replay, immutable history preservation, and rollback after canonical/CAS failures.

## Task Commits

1. **Task 1 RED: strict promotion contract cases** - `215f6d95` (test)
2. **Task 1 GREEN: durable approval records and contracts** - `102f7480` (feat)
3. **Task 2 RED: promotion policy cases** - `e8ad0899` (test)
4. **Task 2 GREEN: atomic repository promotion** - `0c18b3a5` (feat)
5. **Task 3 RED: acknowledgement and promotion route cases** - `2fc718d9` (test)
6. **Task 3 GREEN: verified scoped promotion APIs** - `ed4cfc24` (feat)

## Files Created/Modified

- `app/drizzle/0067_assistant_artifact_approvals.sql` - approval history and comparison acknowledgement persistence.
- `app/src/server/repositories/artifact-version.ts` - scoped idempotent promotion transaction and acknowledgement insert.
- `app/src/server/assistant/artifact-version/promotion.ts` - closed eligibility/effect policy, review verification, and refreshed promotion result.
- `app/src/app/api/assistant/threads/[threadId]/artifact-versions/*/route.ts` - strict authenticated acknowledgement and promotion endpoints.
- Focused repository/service/route tests cover scope, eligibility, forged/stale receipts, success, conflict, rollback, history, and no-credit effects.

## Decisions Made

- Expected official version IDs are carried beside expected revisions so conflict responses can truthfully name old and current official labels.
- Previously approved eligibility is proven by append-only approval history, while legacy `approved` snapshots remain compatible.
- Compound creative promotion requires the exact plan version stored in the creative snapshot; missing legacy bindings fail closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made duplicate historical test migration index idempotent**
- **Found during:** Task 1 migration gate
- **Issue:** Fresh test-database migration stopped in 0023 because 0022 had already created `derivations_workspace_created_at_idx`.
- **Fix:** Added `IF NOT EXISTS` to the duplicate 0023 index statement.
- **Files modified:** `app/drizzle/0023_amusing_supreme_intelligence.sql`
- **Verification:** A fresh Docker test database and repeated `npm run test:db:setup` both migrate successfully through 0067.
- **Committed in:** `102f7480`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The change only restores the required real migration gate; promotion scope and architecture remain unchanged.

## Issues Encountered

- Docker Desktop was installed outside the default CLI path. The verification command used its existing bundled CLI path; no project configuration changed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plans 206-03 and 206-04 can consume strict promotion effects, acknowledgement receipts, refreshed lineage state, and typed 409 recovery without accessing canonical database rows.

## Self-Check: PASSED

- Migration 0067 applies through the real Drizzle test-database path.
- Four focused files pass 24 tests, including live transaction commit/rollback cases.
- TypeScript passes with no errors; promotion source imports no billing or credit module.
- All six TDD task commits and all created files exist; no tracked files were deleted.

---
*Phase: 206-version-compare-and-approval*
*Completed: 2026-06-28*
