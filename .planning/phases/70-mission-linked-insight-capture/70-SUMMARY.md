---
phase: 70-mission-linked-insight-capture
plan: combined
subsystem: mission-insights
tags: [beta, feedback, missions, sanitization]
requires: [69-guided-mission-experience, v11.4-feedback]
provides: [mission-insight-api, mission-insight-prompts, owner-mission-triage]
affects: [feedback-triage, campaign-workspace, dashboard]
tech-stack:
  added: [mission-insight-provider, workspace-mission-insights-api]
  patterns: [feedback_reports reuse, localStorage once-per-moment gating]
key-files:
  created:
    - app/src/app/api/workspace/mission-insights/route.ts
    - app/src/server/mission-insights/sanitize.ts
    - app/src/server/mission-insights/service.ts
    - app/src/components/mission-insights/MissionInsightProvider.tsx
    - app/src/components/mission-insights/MissionInsightPrompt.tsx
    - app/src/lib/mission-insights/types.ts
  modified:
    - app/src/lib/hooks/use-campaign-workspace.ts
    - app/src/components/dashboard/MissionPathCard.tsx
    - app/src/app/(dashboard)/feedback/page.tsx
decisions:
  - Reuse feedback_reports with category mission instead of new table
  - Dismiss and skip record product signals without blocking workflow
  - One prompt per moment per browser via localStorage
metrics:
  duration: ~45m
  completed: 2026-06-06
---

# Phase 70: Mission-Linked Insight Capture Summary

**One-liner:** Structured beta learning at mission moments via lightweight prompts stored in feedback_reports with privacy-safe sanitization and owner triage.

## What Shipped

- `POST /api/workspace/mission-insights` records sentiment, reason, optional note, and safe diagnostics.
- `MissionInsightProvider` shows a playful non-blocking dialog after first readiness, preview, rejection, regeneration, export, share, skip, and credit friction.
- Owner `/feedback` triage filters `category=mission` and surfaces moment/mission/sentiment/reason/action.

## Commits

| Hash | Message |
|------|---------|
| 6ec9360e | feat(70): mission insight API and sanitization |
| 443c7224 | feat(70): insight prompts and owner triage |

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- API route and sanitize tests: 7/7 passed
- Lint: 0 errors
- Key files exist on disk
