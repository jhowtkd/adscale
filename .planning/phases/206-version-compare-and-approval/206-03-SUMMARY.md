---
phase: 206-version-compare-and-approval
plan: "03"
subsystem: ui, api
tags: [react, tanstack-query, artifact-versioning, accessibility, zod]
requires:
  - phase: 206-version-compare-and-approval
    plan: "01"
    provides: sanitized same-lineage comparison responses
  - phase: 206-version-compare-and-approval
    plan: "02"
    provides: atomic promotion, approval history, acknowledgements, and typed conflict recovery
provides:
  - Strict client preservation of canonical artifact-version reload state
  - Scoped comparison, acknowledgement, and non-retrying promotion hooks
  - Persistent newest-first version history with exact comparison shortcuts
  - Durable previously-official labels projected from approval events
affects: [206-04-comparison-workspace, 207-iterative-copilot-integration]
tech-stack:
  added: []
  patterns: [strict cross-layer DTO parsing, query-keyed comparison pairs, context-owned comparison request]
key-files:
  created:
    - app/src/lib/hooks/use-assistant-artifact-versions.ts
    - app/src/components/assistant/VersionHistory.tsx
  modified:
    - app/src/lib/hooks/use-assistant-threads.ts
    - app/src/components/assistant/AssistantSurfaceContext.tsx
    - app/src/components/assistant/AssistantContextPanel.tsx
    - app/src/server/assistant/artifact-version/service.ts
key-decisions:
  - "Thread reload parses each lineage through the shared strict presentation schema so nested dates and future safety checks stay centralized."
  - "Comparison requests live in the existing assistant surface context while server state remains in TanStack Query."
  - "Previously-official labels come from scoped append-only approval events rather than mutable version status or version-number inference."
patterns-established:
  - "Invalid or same-version comparison pairs remain disabled and never issue a request."
  - "Promotion 409 responses become typed recovery errors, invalidate canonical caches once, and never retry."
requirements-completed: [COMP-01, COMP-02, APPR-01, APPR-02, APPR-03]
duration: 10min
completed: 2026-06-28
---

# Phase 206 Plan 03: Version History and Client Hooks Summary

**Canonical version state now survives thread reload, drives a scoped accessible history timeline, and opens exact same-lineage comparisons with non-retrying promotion recovery**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-28T18:00:29Z
- **Completed:** 2026-06-28T18:10:31Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Preserved server-returned lineage state through the thread mapper with strict nested date coercion.
- Added focused TanStack Query hooks for valid comparison pairs, persisted review acknowledgements, and explicit revision-bound promotion commands.
- Added a compact newest-first history with lineage isolation, semantic state/origin/feedback labels, stable loading and empty states, and official-versus-working shortcuts.
- Projected scoped append-only approval history so a ready snapshot remains truthfully labeled after it stops being official.

## Task Commits

1. **Task 1 RED: Artifact version hook behavior** - `ab150545` (test)
2. **Task 1 GREEN: Reload mapping and client hooks** - `234a42ce` (feat)
3. **Task 2 RED: Version history behavior** - `78396055` (test)
4. **Task 2 GREEN: Scoped history timeline** - `6133cfdb` (feat)
5. **Deviation RED: Durable prior-approval projection** - `153d0582` (test)
6. **Deviation GREEN: Truthful prior-official labels** - `f93fdf51` (fix)

## Files Created/Modified

- `app/src/lib/hooks/use-assistant-artifact-versions.ts` - comparison, acknowledgement, promotion, cache invalidation, and typed conflict hooks.
- `app/src/lib/hooks/use-assistant-threads.ts` - strict preservation of canonical artifact-version state.
- `app/src/components/assistant/AssistantSurfaceContext.tsx` - shared typed comparison request registry.
- `app/src/components/assistant/VersionHistory.tsx` - scoped linear timeline and exact-pair shortcuts.
- `app/src/components/assistant/AssistantContextPanel.tsx` - existing-query history placement between review and job status.
- `app/src/lib/assistant/artifact-version.ts` - optional safe prior-approval presentation flag.
- `app/src/server/repositories/artifact-version.ts` - scoped approval-event version lookup.
- `app/src/server/assistant/artifact-version/service.ts` - prior-approval projection into reload presentation.
- Four focused test files cover reload dates, query behavior, conflicts, history states, lineage isolation, placement, and approval history.

## Decisions Made

- Reused the existing strict version schemas, query keys, assistant surface context, buttons, skeletons, and native select; no store, modal manager, dependency, or row-level fetch was added.
- Kept pair order stable because comparison A/B order is semantically meaningful.
- Kept browser-selected IDs as untrusted hints; the server remains authoritative for scope, lineage, eligibility, acknowledgement, and CAS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Projected durable approval history into timeline state**
- **Found during:** Task 2 acceptance review
- **Issue:** Immutable ready snapshots do not change status when promoted, so status alone cannot identify them as previously official after a later promotion.
- **Fix:** Added one scoped approval-event lookup to the existing reload presentation and rendered its boolean label without mutating snapshots.
- **Files modified:** `app/src/lib/assistant/artifact-version.ts`, `app/src/server/repositories/artifact-version.ts`, `app/src/server/assistant/artifact-version/service.ts`, `app/src/components/assistant/VersionHistory.tsx`, and focused tests.
- **Verification:** Service and component tests prove an event-backed ready version renders `Oficial anteriormente`; all 21 focused tests and TypeScript pass.
- **Committed in:** `f93fdf51`

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality).
**Impact on plan:** Required for D-04/D-19 truthfulness; it reuses Plan 02 approval history and adds no persistence or architecture.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 206-04 can host the wide comparison workspace from `versionComparisonRequest`, consume the typed compare/promote hooks, and keep conflicts open for explicit review.

## Self-Check: PASSED

- All created files and six task/deviation commits exist.
- The exact plan test gate plus the approval-history service test passes: 4 files, 21 tests.
- TypeScript completes with no errors; no tracked file was deleted.

---
*Phase: 206-version-compare-and-approval*
*Completed: 2026-06-28*
