---
phase: 64-client-approval-package
plan: "01"
subsystem: api
tags: [approval-package, share-links, signed-urls, derivations]
requires:
  - phase: 63-strategy-recipes-and-preview-gate
    provides: Approved preview/batch derivations for packaging
provides:
  - client-approval-package server module
  - Campaign approval-package GET/POST API
  - Share-link upsert helpers
  - Token-scoped signed asset route
affects: [65-verification-analytics-handoff]
tech-stack:
  added: []
  patterns:
    - "Pure package snapshot builder with staleness detection"
    - "Share link upsert per campaign for refresh without new tables"
key-files:
  created:
    - app/src/server/ai/client-approval-package.ts
    - app/src/app/api/campaigns/[id]/approval-package/route.ts
    - app/src/app/api/share/[token]/asset/[derivationId]/route.ts
  modified:
    - app/src/server/repositories/share-link.ts
key-decisions:
  - "Store package membership in share_links.derivationIds; notes on campaigns.notes"
  - "Expand selected roots to include approved format-adaptation children"
patterns-established:
  - "Approval package snapshots computed from derivations + share link state"
requirements-completed: [DELIVER-01, DELIVER-03, DELIVER-04]
duration: 25min
completed: 2026-06-05
---

# Phase 64 Plan 01: Approval Package Server Contract Summary

**Server contract assembles approved derivations into refreshable packages with workspace-safe share links and signed asset access.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Pure `client-approval-package` module with item building and staleness detection
- `GET/POST /api/campaigns/[id]/approval-package` for snapshot and create/refresh
- Share-link upsert per campaign; signed asset redirects for public gallery

## Task Commits

1. **Task 1: Server module and API** - `9654d96` (feat)

## Files Created/Modified

- `app/src/server/ai/client-approval-package.ts` - Package snapshot builder
- `app/src/app/api/campaigns/[id]/approval-package/route.ts` - Campaign API
- `app/src/app/api/share/[token]/asset/[derivationId]/route.ts` - Signed asset access
- `app/src/server/repositories/share-link.ts` - Upsert/latest helpers

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/src/server/ai/client-approval-package.ts
- FOUND: app/src/app/api/campaigns/[id]/approval-package/route.ts
- FOUND: 9654d96
