---
phase: 107-learning-to-next-experiment
plan: 01
subsystem: api
tags: [performance-learning, recommendation, strategy-recipe, analytics]

requires:
  - phase: 106-client-performance-memory-and-mem0
    provides: campaign learnings API, Mem0 retrieval, confidence/evidence model
provides:
  - Deterministic next-experiment recommendation service
  - GET /api/campaigns/[id]/recommendation
  - NextExperimentRecommendationCard in campaign workspace
  - Strategy recipe prefill on accept/edit
  - next_experiment_* analytics events
affects:
  - 108-performance-learning-release-gate

tech-stack:
  added: []
  patterns:
    - "Score approved learnings deterministically; no LLM winner selection"
    - "Map variable keys (cta/format/recipe/style) to StrategyRecipePrefill"
    - "Session-local dismiss; accept/edit only opens existing derivation flow"

key-files:
  created:
    - app/src/server/performance/recommendation/service.ts
    - app/src/app/api/campaigns/[id]/recommendation/route.ts
    - app/src/components/campaigns/NextExperimentRecommendationCard.tsx
    - app/src/lib/hooks/use-next-experiment-recommendation.ts
  modified:
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
    - app/src/lib/hooks/use-strategy-recipe.ts
    - app/src/lib/hooks/use-derivation-flow.ts
    - app/src/server/beta-analytics/types.ts

key-decisions:
  - "Recommendation ranks learnings by confidence × sample × relevance with contradiction penalty"
  - "Accept and edit both open StrategyRecipePanel; only analytics action differs"
  - "Dismiss persists per recommendation id in sessionStorage for the session"

patterns-established:
  - "RecipePrefill bridges performance learnings and existing strategy recipe UI"

requirements-completed: [NEXT-01, NEXT-02, NEXT-03, NEXT-04]

duration: 45min
completed: 2026-06-12
---

# Phase 107 Plan 01: Next Experiment Recommendation Summary

**Deterministic next-experiment recommendations with explainable evidence and editable strategy-recipe prefill.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 4/4
- **Files modified:** 17

## Accomplishments

- Recommendation service scores approved learnings and builds justification + evidence packet
- Campaign API and UI card expose confidence, sample, contradictions before any action
- Accept/edit opens existing Strategy Recipe flow with CTA/format/recipe/style prefill
- First-party analytics for view, accept, edit, dismiss

## Task Commits

1. **Task 1: Recommendation service and prefill mapping** - `ba166994` (feat)
2. **Task 2: API route and analytics event keys** - `e39ec7a2` (feat)
3. **Task 3: Recommendation card UI and strategy prefill wiring** - `17980165` (feat)

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- FOUND: app/src/server/performance/recommendation/service.ts
- FOUND: app/src/app/api/campaigns/[id]/recommendation/route.ts
- FOUND: app/src/components/campaigns/NextExperimentRecommendationCard.tsx
- FOUND: ba166994
- FOUND: e39ec7a2
- FOUND: 17980165
