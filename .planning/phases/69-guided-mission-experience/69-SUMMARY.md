---
phase: 69-guided-mission-experience
plan: complete
subsystem: progression
tags: [missions, dashboard, onboarding, i18n]
requires: [68-progression-foundation]
provides: [mission-api, mission-path-card, mission-evidence]
affects: [dashboard, progression]
tech-stack:
  added: [missions module]
  patterns: [TanStack Query, inferred evidence, collapsible dashboard card]
key-files:
  created:
    - app/src/lib/progression/missions/types.ts
    - app/src/server/progression/missions/definitions.ts
    - app/src/server/progression/missions/evidence.ts
    - app/src/server/progression/missions/status.ts
    - app/src/server/progression/missions/hrefs.ts
    - app/src/server/progression/missions/service.ts
    - app/src/app/api/workspace/missions/route.ts
    - app/src/lib/hooks/use-missions.ts
    - app/src/components/dashboard/MissionPathCard.tsx
  modified:
    - app/src/app/(dashboard)/page.tsx
    - app/messages/en.json
    - app/messages/pt-BR.json
decisions:
  - Extended progression with missions module instead of duplicating evidence
  - 11 missions map to DB inference with Phase 68 evidence reuse where 1:1
  - Collapsible MissionPathCard below progress card to preserve cockpit flow
metrics:
  duration: ~45m
  completed: 2026-06-06
---

# Phase 69: Guided Mission Experience Summary

**One-liner:** 11-step guided mission path with inferred completion, deep-link CTAs, and collapsible dashboard card teaching the full ADScale creative workflow.

## Delivered

- Mission backend: definitions, evidence inference, status builder, workspace API
- Dashboard `MissionPathCard` with loading/error/empty/completed/blocked states
- i18n learning copy for all 11 missions (EN + pt-BR)
- 9 unit tests passing, lint clean

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- All key files exist
- Tests: 9/9 passed
- Lint: 0 errors
