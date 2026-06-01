---
phase: 47-workspace-review-and-error-feedback
plan: "02"
subsystem: workspace-ui
tags: [quality-gate, derivation-card, WUI-02]
requirements-completed: [WUI-02]
duration: 20min
completed: 2026-06-01
---

# Phase 47 Plan 02: Derivation Card Quality Summary

**Gallery cards show invalid/improvable verdict badges, hard-failure messages, capped scores, and approve-blocked toasts on 409.**

## Task Commits

| Task | Commit |
|------|--------|
| Quality field mapping + derivations errors | `9fd1d73` |
| DerivationCard verdict UI + review 409 | `9fd1d73`, `c74e22e` |

## Key Files

- `app/src/lib/hooks/use-campaign-workspace.ts` — maps `qualityVerdict`, `hardFailures`, `polishSuggestions`
- `app/src/components/workspace/DerivationCard.tsx` — verdict badges, failure list, regenerate-with-fixes CTA
- `app/src/lib/hooks/use-review.ts` — surfaces first hard-failure message on 409
- `app/src/components/workspace/DerivationCard.test.tsx` — verdict badge tests

## Deviations from Plan

**[Rule 1 - Bug]** Replaced `TooltipTrigger asChild` with `title` on disabled approve button — base-ui Tooltip does not support `asChild` (`c74e22e` build fix).

## Self-Check: PASSED

- `app/src/components/workspace/DerivationCard.tsx` FOUND
- `9fd1d73` FOUND
