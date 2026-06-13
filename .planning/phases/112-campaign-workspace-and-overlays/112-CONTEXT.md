# Phase 112 Context

**Goal:** Campaign workspace orientation, sticky geometry, and overlay-safe layout on `/campaigns/[id]`.

**Route:** `/campaigns/[id]` only (not list, not dashboard).

**Families:** FAMILY-WORKSPACE, FAMILY-CAMPAIGN-DETAIL

**Protected (do not modify):**
- `BillingTab.tsx`, `BillingTab.test.tsx`, `billing.ts`

## Changes

| Area | Change |
|------|--------|
| Header | `PageHeader` + `WorkspaceStageStrip` |
| Surface | `Panel` replaces `glass-card` |
| Sections | `PageSection` replaces mono `(01)` labels |
| Sticky | `workspace-sticky-top` + `layer-sticky` on action bar |
| Shell | `shell-offset-bottom-mobile`, `workspace-scroll-padding` |
| Sidebar | Unified `Panel` in `PilotSidebar`, width `280px` |

## Requirements

WORK-01 through WORK-05 (visual/layout only).
