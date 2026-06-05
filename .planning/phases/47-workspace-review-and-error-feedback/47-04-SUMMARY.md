---
phase: 47-workspace-review-and-error-feedback
plan: "04"
subsystem: workspace-ui
tags: [regeneration, feedback, WUI-04]
requirements-completed: [WUI-04]
duration: 15min
completed: 2026-06-01
---

# Phase 47 Plan 04: Regenerate With Failure Reasons Summary

**Regenerate pre-fills feedback from `regenerationSuggestion` or hard failures; user edits in dialog before submit; derivations load errors show inline banner.**

## Task Commits

| Task | Commit |
|------|--------|
| Feedback builder + dialog | `9fd1d73` |
| Workspace regenerate flow + banner | `9fd1d73`, `c74e22e` |

## Key Files

- `app/src/lib/derivation-regeneration-feedback.ts` — `buildRegenerationFeedback`
- `app/src/components/workspace/RegenerateFeedbackDialog.tsx` — editable confirm step
- `app/src/lib/hooks/use-campaign-workspace.ts` — dialog state + confirm handler
- `app/tests/unit/derivation-regeneration-feedback.test.ts` — preference order tests

## Deviations from Plan

None — server regenerate route unchanged (Phase 46 already defaults feedback).

## Self-Check: PASSED

- `app/src/lib/derivation-regeneration-feedback.ts` FOUND
- `9fd1d73` FOUND
