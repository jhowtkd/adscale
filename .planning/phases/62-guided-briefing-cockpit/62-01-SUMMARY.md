---
phase: 62-guided-briefing-cockpit
plan: "01"
subsystem: guided-briefing
tags: [briefing, campaign-draft, i18n]
requires: [61-creative-readiness-foundation]
provides: [guided-briefing-contract, use-guided-briefing, campaign-persist-extensions]
affects: [campaign-workspace, pilot-flow]
tech-stack:
  added: []
  patterns: [rule-based-suggestions, incremental-patch-persist]
key-files:
  created:
    - app/src/server/ai/guided-briefing.ts
    - app/src/server/ai/guided-briefing.test.ts
    - app/src/lib/hooks/use-guided-briefing.ts
    - app/src/lib/hooks/use-guided-briefing.test.tsx
  modified:
    - app/src/app/api/campaigns/[id]/route.ts
    - app/src/app/api/campaigns/[id]/pilot/route.ts
decisions:
  - Guided steps map to existing campaign fields; objections merge into constraints with locale prefix.
  - Suggestions are deterministic from prior answers and creative analysis hints (no extra credits).
metrics:
  duration: "~15m"
  completed: "2026-06-05"
---

# Phase 62 Plan 01: Guided Briefing Contract and Persistence Summary

**One-liner:** Rule-based guided briefing contract with step order, weak-brief detection, draft mapping, PATCH/pilot persistence, and `useGuidedBriefing` hook.

## What Shipped

- `guided-briefing.ts` — step order, `isBriefWeak`, `buildSuggestion`, `mapGuidedAnswersToCampaignDraft`, pilot mapping.
- Extended `PATCH /api/campaigns/[id]` with `offer`, `platforms`, `tone`.
- Extended `POST /api/campaigns/[id]/pilot` with `product` and `offer`.
- `useGuidedBriefing` — accept/edit/skip, incremental persist via `useUpdateCampaign`.

## Requirements

| ID | Status |
|----|--------|
| GUIDE-01 | Partial (contract + hook; UI in 62-02) |
| GUIDE-02 | Covered |
| GUIDE-04 | Covered |
| GUIDE-05 | Covered (locale-aware suggestions) |

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- `app/src/server/ai/guided-briefing.ts` — FOUND
- `app/src/lib/hooks/use-guided-briefing.ts` — FOUND
- Tests: 14 passed across guided-briefing suite
