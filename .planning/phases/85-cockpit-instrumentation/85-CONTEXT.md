# Phase 85: Cockpit Instrumentation - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart discuss — recommended defaults accepted)

<domain>
## Phase Boundary

Wire recipe tradeoff/selection events, guided briefing step abandon enrichment, preview funnel false-abandon fix, and owner dashboard recipe/briefing aggregations (COCK-01 through COCK-05).
</domain>

<decisions>
## Implementation Decisions

### Event schema
- Extend `PHASE_76_BETA_EVENT_KEYS` with `recipe_selected`, `recipe_tradeoff_viewed`
- Add `recipeId` and `stepId` to `ALLOWED_PROPERTY_KEYS`

### Instrumentation
- `recipe_tradeoff_viewed` once per panel open; `recipe_selected` on explicit click with `recipeId`
- Guided briefing abandon carries `stepId` from `guided.currentStep`
- Remove `cockpit_stage_abandoned` from preview recipe revise (F-06)

### Aggregation
- `aggregateRecipeFunnel`, `aggregateGuidedBriefingAbandonByStep` in `aggregate.ts`
- Owner dashboard tables for recipe funnel and briefing abandon by step

### Claude's Discretion
Implementation details follow v11.8 instrumentation patterns and `.planning/research/ARCHITECTURE.md`.
</decisions>
