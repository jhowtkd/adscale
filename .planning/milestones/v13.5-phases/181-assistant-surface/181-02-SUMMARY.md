---
phase: 181-assistant-surface
plan: 02
subsystem: ui
tags: [nextjs, react, assistant, topbar, layout, i18n]

requires:
  - phase: 181-assistant-surface
    provides: Plan 01 hooks (parallel wave; not required for shell routing)
provides:
  - TopBar Panel ↔ Chat segmented toggle (D-CHAT-01)
  - Canonical /assistant route under dashboard auth
  - DashboardShellSwitcher bypassing AppShell double-wrap
  - AssistantShell three-column desktop layout + mobile tabs scaffold
affects: [181-03, 181-04, 181-05]

tech-stack:
  added: []
  patterns:
    - "Route-derived chat mode via pathname.startsWith('/assistant')"
    - "sessionStorage adscale:panel-return for last panel path"
    - "Composition slots sidebar/main/contextPanel on AssistantShell"

key-files:
  created:
    - app/src/components/layout/DashboardShellSwitcher.tsx
    - app/src/components/assistant/AssistantShell.tsx
    - app/src/components/assistant/AssistantMobileTabs.tsx
    - app/src/app/(dashboard)/assistant/layout.tsx
    - app/src/app/(dashboard)/assistant/page.tsx
  modified:
    - app/src/components/layout/TopBar.tsx
    - app/src/components/layout/TopBar.test.tsx
    - app/src/app/(dashboard)/layout.tsx
    - app/messages/en.json
    - app/messages/pt-BR.json

key-decisions:
  - "Panel return path saved when entering chat, not when clicking Panel"
  - "Assistant paths get FeedbackProvider via DashboardShellSwitcher without full AppShell chrome"

patterns-established:
  - "Pattern: DashboardShellSwitcher conditionally skips AppShell footer/bottom nav on /assistant"
  - "Pattern: AssistantShell renders TopBar without Footer or panel bottom navigation"

requirements-completed: [CHAT-01]

duration: 15min
completed: 2026-06-25
---

# Phase 181 Plan 02: CHAT-01 Surface Summary

**TopBar Panel ↔ Chat toggle with `/assistant` route and Codex-style AssistantShell without AppShell double-wrap**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-25T20:57:00Z
- **Completed:** 2026-06-25T21:12:31Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Segmented Panel/Chat toggle in TopBar routes to `/assistant` or stored panel path (no dedicated Assistente nav item)
- `DashboardShellSwitcher` bypasses AppShell on assistant paths while preserving feedback providers
- `AssistantShell` delivers desktop three-column grid and mobile Tree | Chat | Context tabs

## Task Commits

1. **Task 1: TopBar Panel ↔ Chat segmented toggle** - `915e074` (feat)
2. **Task 3: AssistantShell three-column layout and mobile tabs** - `6424046` (feat)
3. **Task 2: Dashboard shell switcher and assistant route** - `6f8567d` (feat)

**Plan metadata:** pending (docs commit)

_Note: Task 3 committed before Task 2 because `assistant/layout.tsx` depends on `AssistantShell`._

## Files Created/Modified

- `app/src/components/layout/TopBar.tsx` - Mode toggle with sessionStorage panel return
- `app/src/components/layout/DashboardShellSwitcher.tsx` - Conditional AppShell bypass
- `app/src/components/assistant/AssistantShell.tsx` - Three-column shell with collapsible context
- `app/src/components/assistant/AssistantMobileTabs.tsx` - Mobile bottom tabs
- `app/src/app/(dashboard)/assistant/page.tsx` - Thread placeholder page

## Decisions Made

- Panel return path is written when switching to Chat from a panel route; Panel segment reads stored path only
- `FeedbackProvider` + `MissionInsightProvider` wrap assistant children in switcher to keep TopBar feedback button functional without duplicating providers inside `AssistantShell`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] FeedbackProvider for assistant paths**
- **Found during:** Task 2 (DashboardShellSwitcher)
- **Issue:** Skipping AppShell removed FeedbackProvider; TopBar FeedbackTriggerButton would throw
- **Fix:** Wrap assistant-path children with FeedbackProvider and MissionInsightProvider in DashboardShellSwitcher
- **Files modified:** `app/src/components/layout/DashboardShellSwitcher.tsx`
- **Committed in:** `6f8567d`

**2. [Rule 3 - Blocking] Commit order for AssistantShell dependency**
- **Found during:** Task 2
- **Issue:** `assistant/layout.tsx` imports AssistantShell defined in Task 3
- **Fix:** Committed Task 3 shell components before Task 2 route integration
- **Committed in:** `6424046` then `6f8567d`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Required for correctness and compilability; no scope creep.

## Known Stubs

| File | Description | Resolved by |
|------|-------------|-------------|
| `assistant/layout.tsx` | Sidebar/context placeholders ("Tree", "Context") | Plan 181-03/04 |
| `assistant/page.tsx` | "Chat placeholder" when threadId present | Plan 181-04 |

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shell scaffold ready for Plan 03 navigation tree and Plan 04 chat core wiring
- TopBar toggle and routing complete for CHAT-01

## Self-Check: PASSED

- FOUND: app/src/components/layout/DashboardShellSwitcher.tsx
- FOUND: app/src/components/assistant/AssistantShell.tsx
- FOUND: app/src/app/(dashboard)/assistant/page.tsx
- FOUND: commit 915e074
- FOUND: commit 6424046
- FOUND: commit 6f8567d

---
*Phase: 181-assistant-surface*
*Completed: 2026-06-25*
