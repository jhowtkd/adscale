---
phase: 141-review-surface-and-override-ux
plan: 01
subsystem: ui
tags: [react, next-intl, olhar, dual-verdict, review-ux]

requires:
  - phase: 140-advisor-and-generation-direction
    provides: olharVerdict/exportStatus on derivations and direction-first scoring
provides:
  - Olhar-first DerivationCard badges with package eligibility hints
  - Direction-first DerivationReviewSheet with Entra/Quase/Não entra controls
  - useReviewDerivation structured decision payload and client validation
affects:
  - 141-02 override audit trail and package gating

tech-stack:
  added: []
  patterns:
    - derivation-review-display helpers for dual-verdict labels and blocking rules
    - Client-side direction reason gate before review PATCH

key-files:
  created:
    - app/src/lib/derivation-review-display.ts
    - app/src/lib/hooks/use-review.test.tsx
  modified:
    - app/src/components/workspace/DerivationCard.tsx
    - app/src/components/workspace/DerivationReviewSheet.tsx
    - app/src/lib/hooks/use-review.ts
    - app/src/lib/hooks/use-campaign-workspace.ts
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
    - app/messages/pt-BR.json
    - app/messages/en.json

key-decisions:
  - "Promote Olhar and Exportação badges ahead of numeric score on workspace cards"
  - "Block normal Entra approval for sem_opiniao, confusa, and export bloqueado without renaming verdict labels"
  - "Require direction reason client-side for quase_regenerar and nao_entra before review mutation"
  - "Chain quase_regenerar to regenerate mutation after rejected status update"

patterns-established:
  - "derivation-review-display.ts centralizes dual-verdict tone, blocking, and decision mapping"
  - "Review sheet uses collapsed details for Exportação and score/debug sections"

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-03]

duration: 12min
completed: 2026-06-19
---

# Phase 141 Plan 01: Workspace Review UI and Decision Language Summary

**Olhar-first workspace review with dual-verdict badges, direction-led review sheet, and structured Entra/Quase/Não entra client decisions**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-19T12:37:00Z
- **Completed:** 2026-06-19T12:55:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- `DerivationCard` shows Olhar and Exportação as separate first-class signals; score is secondary detail only
- `sem_opiniao`, `confusa`, and `bloqueado` visibly block normal approval and show package eligibility hints
- `DerivationReviewSheet` prioritizes creative verdict, direction note, what works/blocks, then collapsed Exportação and score details
- Decision controls use `Entra`, `Quase — regenerar assim`, and `Não entra` with direction reason validation
- `useReviewDerivation` accepts structured decisions while preserving legacy `{ status }` callers

## Task Commits

Each task was committed atomically:

1. **Task 141-01-01: Card-level Olhar/Exportacao badges** - `19c644fb` (feat)
2. **Task 141-01-02: Review sheet information architecture** - `1c5648b7` (feat)
3. **Task 141-01-03: Structured decision language in client mutation** - `589ef2d7` (feat)

## Files Created/Modified

- `app/src/lib/derivation-review-display.ts` - Dual-verdict display helpers, blocking rules, decision mapping
- `app/src/components/workspace/DerivationCard.tsx` - Olhar-first badge row and blocked approval UX
- `app/src/components/workspace/DerivationReviewSheet.tsx` - Direction-first modal IA and decision controls
- `app/src/lib/hooks/use-review.ts` - Structured review mutation with validation
- `app/src/lib/hooks/use-review.test.tsx` - Hook payload and validation coverage
- `app/src/lib/hooks/use-campaign-workspace.ts` - Review decision wiring and quase→regenerate chain
- `app/messages/pt-BR.json`, `app/messages/en.json` - Olhar/Exportação and decision copy

## Decisions Made

- Kept verdict labels literal (`sem_opiniao`, `confusa`, `bloqueado`) per phase stop conditions
- Used native `<details>` for collapsed Exportação and score sections to avoid new UI dependencies
- Sent `decision` and `directionReason` in PATCH body ahead of 141-02 API contract work; status mapping remains authoritative for now

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 141-02 can extend review API to persist `decision`, `directionReason`, and `overrideReason`
- Package gating and override audit should consume the same blocking helpers already surfaced in UI
- Focused UI/hook tests pass (41 tests across card, sheet, and hook)

## Self-Check: PASSED

- FOUND: `.planning/phases/141-review-surface-and-override-ux/141-01-SUMMARY.md`
- FOUND: `app/src/lib/derivation-review-display.ts`
- FOUND: commit `19c644fb`
- FOUND: commit `1c5648b7`
- FOUND: commit `589ef2d7`

---
*Phase: 141-review-surface-and-override-ux*
*Completed: 2026-06-19*
