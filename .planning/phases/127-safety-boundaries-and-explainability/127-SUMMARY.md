---
phase: 127-safety-boundaries-and-explainability
plan: "01-03"
subsystem: api
tags: [output-learning, safety, factual-integrity, explainability, audit-trace]

requires:
  - phase: 126-next-generation-recommendation-application
    provides: output recommendation service and bounded prefill
provides:
  - filterApprovedPostgresLearnings and guardOutputLearningPrefill safety layer
  - appliedLearningTrace on recommendation API payload
  - Structured server log and beta accept trace metadata
affects:
  - 128-evaluation-and-release-gate

tech-stack:
  added: []
  patterns:
    - "Postgres-approved-only filter before ranking (no Mem0 authorization)"
    - "Prefill sanitization guards for factual mode and identity conflicts"
    - "avoid_pattern trace entries always applied:false"

key-files:
  created:
    - app/src/server/output-learning/safety/types.ts
    - app/src/server/output-learning/safety/guards.ts
    - app/src/server/output-learning/safety/guards.test.ts
  modified:
    - app/src/server/output-learning/recommendation/service.ts
    - app/src/server/output-learning/recommendation/types.ts
    - app/src/server/output-learning/recommendation/service.test.ts
    - app/src/components/campaigns/OutputLearningRecommendationCard.tsx
    - app/src/components/campaigns/OutputLearningRecommendationCard.test.tsx

key-decisions:
  - "Mem0 never authorizes generation changes — filterApprovedPostgresLearnings after repository fetch"
  - "Restyling campaigns block format_adaptation prefill from learnings"
  - "appliedLearningTrace includes evidence event IDs and blocked field audit"

patterns-established:
  - "Safety guards sanitize prefill without dropping recommendation entirely"

requirements-completed: [SAFE-01, SAFE-02, SAFE-03, SAFE-04]

duration: 25min
completed: 2026-06-16
---

# Phase 127: Safety, Boundaries, and Explainability Summary

**Output learnings apply through Postgres-approved guards with auditable traces — factual contracts and avoid patterns stay protected**

## Performance

- **Duration:** 25 min
- **Tasks:** 3 plans
- **Files modified:** 8

## Accomplishments

- `guardOutputLearningPrefill` blocks factual-contract conflicts (restyling vs format_adaptation, readiness blocked caps, format identity creative cap)
- `filterApprovedPostgresLearnings` enforces SAFE-02 — only approved canonical rows influence recommendations
- `appliedLearningTrace` on API payload with evidence event IDs, blocked fields, and avoid-pattern hint entries
- Structured `[output-learning] applied learning trace` server log on each recommendation fetch

## Task Commits

1. **127-01: safety guards** - `ff16fce9`
2. **127-02: service wiring** - `a39576e6`
3. **127-03: UI audit events** - `e52b8605`

## Files Created/Modified

- `app/src/server/output-learning/safety/*` — types, guards, unit tests
- `app/src/server/output-learning/recommendation/service.ts` — guard + trace integration
- `app/src/server/output-learning/recommendation/types.ts` — `appliedLearningTrace` on recommendation
- `app/src/components/campaigns/OutputLearningRecommendationCard.tsx` — traceId in accept analytics

## Decisions Made

- Guards sanitize conflicting prefill fields rather than suppressing the whole recommendation
- avoid_pattern learnings appear in trace with `applied: false` and `avoid_pattern_hint_only` guard code
- Beta accept events carry traceId and evidenceEventCount (scalar properties only)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 128 can run evaluation gate against factual fidelity baseline with safety layer in place

## Self-Check: PASSED

- FOUND: app/src/server/output-learning/safety/guards.ts
- FOUND: app/src/server/output-learning/safety/guards.test.ts
- FOUND: ff16fce9
- FOUND: a39576e6
- FOUND: e52b8605
