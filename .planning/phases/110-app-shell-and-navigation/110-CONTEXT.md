# Phase 110: App Shell and Navigation - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate authenticated chrome (AppShell, TopBar, mobile navigation, footer offsets) to Phase 109 canonical shell geometry and layer tokens. Resolve DEFECT-LANDMARKS. Introduce a shared authenticated page frame so routes share predictable gutters and max-widths. No business logic, permissions, or workflow changes.

</domain>

<decisions>
## Implementation Decisions

### Shell geometry
- AppShell, TopBar, and mobile bottom nav consume `--shell-*` tokens and `.layer-shell*` classes — no literal `pt-12`, `5rem`, `z-40`, or `z-50` in layout chrome.
- Mobile content bottom reserve uses `--shell-safe-bottom` (4rem nav + safe area), not ad-hoc 5rem.
- TopBar height follows `--shell-topbar-mobile` / `--shell-topbar-desktop`.

### Landmarks (DEFECT-LANDMARKS)
- Root `layout.tsx` wrapper is a non-landmark `div`; authenticated primary content lives in a single `<main id="main">` inside AppShell (excluding TopBar and mobile nav).
- Public legal pages keep their own `<main id="main">`; remove duplicate nesting from root.

### Page frame (SHELL-03)
- Add `PageFrame` with `page-gutters` and `content-*` width variants (`operational` default, `workspace` for campaign detail).
- Phase 110 migrates all `(dashboard)/**/page.tsx` wrappers; deeper surface hierarchy stays Phase 111.

### TopBar (SHELL-02, SHELL-04)
- Shared nav config with i18n for desktop and mobile.
- Show `currentPageTitle` on non-dashboard routes at `md+`.
- Notification panel uses `layer-popover`.

### Claude's Discretion
- Whether nav links extract to `NavLinks.tsx`.
- Exact intermediate-width breakpoints for action progressive disclosure.
- App sidebar rail tokens remain reserved (no app sidebar in this phase).

</decisions>

<specifics>
## Carried from Phase 109

- DEFECT-LANDMARKS owner: Phase 110.
- FAMILY-LAYOUT and ROUTE-AUTH-LAYOUT owned by Phase 110.
- SCN-AUTH-SHELL is the Phase 114 scenario for shell proof.

</specifics>

<code_context>
## Integration Points

- `app/src/components/layout/AppShell.tsx`, `TopBar.tsx`, `Footer.tsx`
- `app/src/app/layout.tsx`, `app/src/app/(dashboard)/layout.tsx`
- `app/src/app/globals.css` shell utilities
- All `(dashboard)/**/page.tsx` route wrappers

</code_context>

---

*Phase: 110-app-shell-and-navigation*
*Context gathered: 2026-06-13*
