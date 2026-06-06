---
phase: 62-guided-briefing-cockpit
plan: "02"
subsystem: guided-briefing-ui
tags: [workspace, i18n, pilot]
requires: [62-01]
provides: [GuidedBriefingPanel, workspace-integration]
affects: [campaigns/[id]/page]
tech-stack:
  added: []
  patterns: [one-question-flow, accept-edit-skip]
key-files:
  created:
    - app/src/components/workspace/GuidedBriefingPanel.tsx
    - app/src/components/workspace/GuidedBriefingPanel.test.tsx
  modified:
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
    - app/messages/en.json
    - app/messages/pt-BR.json
    - app/src/lib/hooks/use-campaign-workspace.ts
    - app/src/lib/hooks/use-campaigns.ts
decisions:
  - Weak briefs default to guided panel; full PilotBriefingForm via "Edit all fields".
metrics:
  duration: "~20m"
  completed: "2026-06-05"
---

# Phase 62 Plan 02: Guided Briefing UI Summary

**One-liner:** GuidedBriefingPanel in pilot workspace with EN/PT-BR copy, accept/edit/skip, and savePilot on completion.

## What Shipped

- `GuidedBriefingPanel` — one question at a time, progress, suggestion card, edit mode for product/offer split.
- Campaign workspace shows guided flow when `isBriefWeak(campaign)`.
- `guidedBriefing` i18n namespace in EN and PT-BR.
- `UiCampaign` extended with `product` for type-safe workspace data.

## Requirements

| ID | Status |
|----|--------|
| GUIDE-01 | Covered |
| GUIDE-02 | Covered |
| GUIDE-03 | Covered |
| GUIDE-04 | Covered |
| GUIDE-05 | Covered |

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- `app/src/components/workspace/GuidedBriefingPanel.tsx` — FOUND
- Build — PASSED
- Lint — 0 errors
