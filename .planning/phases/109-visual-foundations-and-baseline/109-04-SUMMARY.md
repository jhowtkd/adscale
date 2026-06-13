---
phase: 109-visual-foundations-and-baseline
plan: "04"
subsystem: ui-primitives
tags: [button, input, badge, table, skeleton, empty-state, vitest]
requires:
  - phase: 109-03
    provides: Canonical token, geometry, density, and layer contracts
provides:
  - Canonical basic controls and data-state primitives with unchanged public APIs
  - Executable tests for button, field, badge, status, table, skeleton, empty, loading, and error proof states
affects: [109-05, 109-06, 110, 111]
tech-stack:
  added: []
  patterns: [canonical primitive styling, semantic status mapping, tonal empty states]
key-files:
  created: []
  modified:
    - app/src/components/ui/button.tsx
    - app/src/components/ui/input.tsx
    - app/src/components/ui/textarea.tsx
    - app/src/components/ui/badge.tsx
    - app/src/components/ui/StatusBadge.tsx
    - app/src/components/ui/table.tsx
    - app/src/components/ui/skeleton.tsx
    - app/src/components/ui/EmptyState.tsx
    - app/src/components/ui/visual-foundations.test.tsx
key-decisions:
  - "Basic controls consume canonical density, radius, motion, and semantic roles without caller migration."
  - "StatusBadge maps product statuses to semantic families with dot plus accessible label."
  - "EmptyState uses tonal structure and shared Button actions instead of route-local accent classes."
patterns-established:
  - "Primitive proof stays API-compatible while visual dialect debt in changed files is reduced, not expanded."
requirements-completed: [FOUND-01, FOUND-02, FOUND-05]
duration: 18 min
completed: 2026-06-13
---

# Phase 109 Plan 04: Basic Controls and Data States Summary

**Canonical buttons, fields, badges, statuses, tables, skeletons, and empty states with public API compatibility**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-13T14:52:00Z
- **Completed:** 2026-06-13T15:10:30Z
- **Tasks:** 4
- **Files modified:** 9

## Accomplishments

- Normalized Button, Input, and Textarea to canonical control heights, radii, motion, and field text sizing while preserving variants, sizes, and accessibility states.
- Added semantic badge variants and refactored StatusBadge to canonical status token classes with dot, label, and neutral fallback.
- Updated Table, Skeleton, and EmptyState to compact tonal contracts with tabular numbers, shimmer-safe skeletons, and shared Button actions.
- Expanded `visual-foundations.test.tsx` with 15 primitive behavior tests covering disabled, invalid, loading, empty, and recoverable error compositions.

## Task Commits

1. **Normalize buttons and fields through public behavior tests** - `46a68b5f` (feat)
2. **Normalize badge and typed status semantics** - `8288e88a` (feat)
3. **Normalize table, skeleton, empty, loading, and error proof states** - `d66a6429` (feat)
4. **Close basic-control compatibility and protected-worktree checks** - pending (docs)

## Verification

- `npx vitest run src/components/ui/visual-foundations.test.tsx` — 19 passed
- `node scripts/check-visual-contract.mjs` — all sections passed
- `node app/scripts/snapshot-visual-dirty-state.mjs verify` — protected billing/preview files unchanged
- `node app/scripts/check-plan-scope.mjs verify --plan 109-04` — 9 scoped paths only

## Self-Check: PASSED
