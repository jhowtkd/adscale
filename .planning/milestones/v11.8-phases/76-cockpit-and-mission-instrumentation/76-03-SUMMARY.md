---
phase: 76-cockpit-and-mission-instrumentation
plan: 03
subsystem: ui
tags: [beta-analytics, cockpit-instrumentation, react-hooks, vitest, fire-and-forget]

requires:
  - phase: 76-cockpit-and-mission-instrumentation
    plan: 01
    provides: PHASE_76_BETA_EVENT_KEYS, BETA_SESSION_STORAGE_KEY contract
provides:
  - useRecordBetaEvent fire-and-forget client hook
  - Cockpit stage enter/complete/abandon events on four panels
  - Client sessionId from sessionStorage when present (INST-04)
affects:
  - 76-04 integration smoke tests
  - 77 operator session UI (populates sessionStorage)
  - 78 owner funnel aggregation

tech-stack:
  added: []
  patterns:
    - "Client beta events via fetch POST with .catch(() => {}) — no UI blocking"
    - "completedRef + useEffect cleanup for abandon-on-unmount lifecycle"
    - "BETA_SESSION_STORAGE_KEY in lib/beta-analytics/constants (client-safe)"

key-files:
  created:
    - app/src/lib/beta-analytics/constants.ts
    - app/src/lib/hooks/use-record-beta-event.ts
    - app/src/lib/hooks/use-record-beta-event.test.ts
  modified:
    - app/src/components/workspace/GuidedBriefingPanel.tsx
    - app/src/components/workspace/StrategyRecipePanel.tsx
    - app/src/components/workspace/CreativeReadinessPanel.tsx
    - app/src/components/workspace/PreviewGatePanel.tsx
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
    - app/src/server/beta-analytics/session.ts

key-decisions:
  - "Extract BETA_SESSION_STORAGE_KEY to lib/beta-analytics/constants.ts to avoid client bundling server code"
  - "Add campaignId prop to StrategyRecipePanel and PreviewGatePanel for analytics context"

patterns-established:
  - "Cockpit panels emit cockpit_stage_entered on mount/open, completed on success, abandoned on cancel/unmount"
  - "Readiness completed deduped via ref when status is ready or needs_attention"

requirements-completed: [INST-03, INST-04]

duration: 3min
completed: 2026-06-07
---

# Phase 76 Plan 03: Client Cockpit Instrumentation Summary

**Fire-and-forget `useRecordBetaEvent` hook with stage funnel events on briefing, recipe, readiness, and preview gate panels**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-07T15:13:00Z
- **Completed:** 2026-06-07T15:16:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- `useRecordBetaEvent` posts to `/api/analytics/events` fire-and-forget with sessionId from sessionStorage
- All four cockpit panels emit `cockpit_stage_entered`, `cockpit_stage_completed`, and `cockpit_stage_abandoned` per D-03
- Component tests mock hook and assert event call sequence (27 tests green)
- Lint passes with no client importing server-only modules

## Task Commits

1. **Task 1: useRecordBetaEvent fire-and-forget hook** - `cc3f49fc` (feat)
2. **Task 2: Guided briefing and strategy recipe panel instrumentation** - `05318526` (feat)
3. **Task 3: Readiness and preview gate panel instrumentation** - `1e56ed10` (feat)

## Files Created/Modified

- `app/src/lib/beta-analytics/constants.ts` - Client-safe BETA_SESSION_STORAGE_KEY
- `app/src/lib/hooks/use-record-beta-event.ts` - Fire-and-forget analytics hook
- `app/src/lib/hooks/use-record-beta-event.test.ts` - Hook contract tests
- `app/src/components/workspace/GuidedBriefingPanel.tsx` - Briefing stage lifecycle events
- `app/src/components/workspace/StrategyRecipePanel.tsx` - Recipe stage lifecycle events
- `app/src/components/workspace/CreativeReadinessPanel.tsx` - Readiness stage lifecycle events
- `app/src/components/workspace/PreviewGatePanel.tsx` - Preview gate stage lifecycle events
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` - campaignId pass-through for recipe/preview panels
- `app/src/server/beta-analytics/session.ts` - Re-exports key from client-safe constants

## Decisions Made

- Moved `BETA_SESSION_STORAGE_KEY` to `lib/beta-analytics/constants.ts` with server re-export (avoids client bundling server module)
- Added `campaignId` prop to `StrategyRecipePanel` and `PreviewGatePanel` (required by hook, not in original panel interfaces)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- CreativeReadinessPanel rerun test needed `mockMutateAsync` to return a resolved promise (pre-existing test pattern; fixed in test mock)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Client instrumentation complete for INST-03/INST-04 client side
- Ready for 76-04 integration smoke tests and 76-02 server events (parallel wave 2)
- Phase 77 will populate `sessionStorage` key; hook already reads when present

## Self-Check: PASSED

- All key files FOUND
- Commits cc3f49fc, 05318526, 1e56ed10 FOUND

---
*Phase: 76-cockpit-and-mission-instrumentation*
*Completed: 2026-06-07*
