---
phase: 91
plan: 01
subsystem: beta-analytics
tags: [share, readiness, instrumentation]
requires: [phase 90]
provides: [share_link_opened server event, blockingDimensions on override, approval_package_refreshed]
affects: [share page, preflight route, approval-package route]
key-files:
  modified:
    - app/src/app/share/[token]/page.tsx
    - app/src/app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts
    - app/src/app/api/campaigns/[id]/approval-package/route.ts
    - app/src/server/ai/creative-readiness.ts
metrics:
  completed: 2026-06-08
---

# Phase 91 Plan 01: Share + Readiness Instrumentation Summary

**One-liner:** Server-side `share_link_opened` on valid token; readiness override events carry comma-separated `blockingDimensions`; stale approval package save emits `approval_package_refreshed`.

## Requirements

- SHARE-01 — share link open event
- SHARE-02 — share open count aggregation (wired in phase 92 panel)
- READY-09 — override-by-dimension dashboard data

## Self-Check: PASSED
