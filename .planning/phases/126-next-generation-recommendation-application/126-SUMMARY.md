---
phase: 126-next-generation-recommendation-application
plan: "01-03"
subsystem: api
tags: [output-learning, recommendation, prefill, campaign-generation]

requires:
  - phase: 125-canonical-output-learnings
    provides: client_output_learnings with approved bounded learnings
provides:
  - getOutputLearningRecommendation service with evidence/contradiction packet
  - mapOutputLearningToPrefill for bounded product variables
  - GET /api/campaigns/[id]/output-recommendation
  - OutputLearningRecommendationCard wired before derive/credits
affects:
  - 127-safety-boundaries-explainability

tech-stack:
  added: []
  patterns:
    - "Mirror performance/recommendation service structure for output learnings"
    - "avoid_pattern as informational hints only — never in prefill"

key-files:
  created:
    - app/src/server/output-learning/recommendation/types.ts
    - app/src/server/output-learning/recommendation/map-prefill.ts
    - app/src/server/output-learning/recommendation/service.ts
    - app/src/app/api/campaigns/[id]/output-recommendation/route.ts
    - app/src/lib/hooks/use-output-learning-recommendation.ts
    - app/src/components/campaigns/OutputLearningRecommendationCard.tsx
  modified:
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx

key-decisions:
  - "Primary prefill from prefer-direction keys only; avoid_pattern in separate hints array"
  - "Scope filtering excludes learnings whose mode/format scope mismatches campaign context"
  - "Postgres-only learningsSource (no Mem0 read path for recommendations)"

patterns-established:
  - "Output recommendation mirrors v12.1 performance recommendation module layout"

requirements-completed: [APPLY-01, APPLY-02, APPLY-03, APPLY-04]

duration: 35min
completed: 2026-06-16
---

# Phase 126: Next-Generation Recommendation Application Summary

**Approved output learnings drive bounded recipe prefill via GET /api/campaigns/[id]/output-recommendation before derive panel and credit spend**

## Performance

- **Duration:** 35 min
- **Tasks:** 3 plans
- **Files modified:** 11

## Accomplishments

- `getOutputLearningRecommendation` ranks approved learnings, builds evidence/contradiction packet, returns honest `insufficient_evidence`
- `mapOutputLearningToPrefill` maps only cta, generation_mode, format, style_policy — no prompt prose
- API + hook + card wired at `#mission-output-learnings` above `WorkspaceActionBar` (before credits)
- `avoid_pattern` learnings surface as informational hints only

## Task Commits

1. **126-01: types + map-prefill** - `6cac21e8`
2. **126-02: service + API** - `cf60a7c4`
3. **126-03: UI wiring** - `269b6b92`

## Files Created/Modified

- `app/src/server/output-learning/recommendation/*` — types, map-prefill, service + tests
- `app/src/app/api/campaigns/[id]/output-recommendation/route.ts` — campaign recommendation API
- `app/src/lib/hooks/use-output-learning-recommendation.ts` — client hook
- `app/src/components/campaigns/OutputLearningRecommendationCard.tsx` — pre-generation UI
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — wired above derive action bar

## Decisions Made

- Primary recommendation excludes `avoid_pattern` and `preferDirection: avoid` from prefill mapping
- Scoped learnings filtered when campaign context conflicts with scope columns
- Reused strategy recipe prefill shape compatible with `useStrategyRecipe.initialPrefill`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 127 can add factual-contract safety guards on applied learnings
- Recommendation payload is inspectable via API for explainability requirements

## Self-Check: PASSED

- FOUND: app/src/server/output-learning/recommendation/service.ts
- FOUND: app/src/app/api/campaigns/[id]/output-recommendation/route.ts
- FOUND: app/src/components/campaigns/OutputLearningRecommendationCard.tsx
- FOUND: 6cac21e8
- FOUND: cf60a7c4
- FOUND: 269b6b92

---
*Phase: 126-next-generation-recommendation-application*
*Completed: 2026-06-16*
