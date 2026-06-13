---
phase: 110-app-shell-and-navigation
plans: 5
subsystem: app-shell
requirements-completed: [SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05]
completed: 2026-06-13
---

# Phase 110: App Shell and Navigation — Summary

**Token-backed chrome, PageFrame, i18n TopBar, and browser-proof shell geometry**

## Plans

| Plan | Focus | Status |
|------|-------|--------|
| 110-01 | Shell geometry & layer tokens | ✅ |
| 110-02 | Landmarks & PageFrame | ✅ |
| 110-03 | TopBar i18n & title | ✅ |
| 110-04 | Route PageFrame adoption | ✅ |
| 110-05 | Shell e2e + evidence | ✅ |

## Deliverables

- `--shell-*` utilities; `layer-shell-floating` / `layer-popover` on chrome
- Single `<main id="main">` in AppShell; `PageFrame` with canonical gutters/widths
- TopBar i18n; `currentPageTitle` on sub-routes
- `visual-shell.spec.ts` — 9 geometry checks; `DEFECT-LANDMARKS` resolved

## Verification

See [110-VERIFICATION.md](110-VERIFICATION.md)
