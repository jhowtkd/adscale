# Phase 126: Next-Generation Recommendation Application - Context

**Gathered:** 2026-06-16
**Status:** Ready for execution (autonomous decisions)

<domain>
## Phase Boundary

Phase 126 applies approved `client_output_learnings` as a recommendation/prefill packet before generation (strategy recipe / derive panel) and before credit spend. Mirrors v12.1 performance recommendation structure.

Does not implement Phase 127 safety guards (factual override blocking) or prompt prose mutation.
</domain>

<decisions>
## Implementation Decisions

### Module layout
- `app/src/server/output-learning/recommendation/types.ts` — OutputLearningRecommendation + prefill types
- `app/src/server/output-learning/recommendation/map-prefill.ts` — bounded key mapping only
- `app/src/server/output-learning/recommendation/service.ts` — rank, evidence, contradictions, insufficient_evidence

### Bounded prefill keys (APPLY-02)
- Maps: `cta`, `generation_mode`, `format`, `style_policy` → recipe/generation config
- `avoid_pattern` included in recommendation payload as hints only — never in prefill or prompt prose

### API
- `GET /api/campaigns/[id]/output-recommendation` with optional `generationMode` and `format` query for scope filtering

### UI wiring
- Hook + card mirroring `NextExperimentRecommendationCard`
- Wire above `WorkspaceActionBar` (`#mission-output-learnings`) — accept opens derive panel with prefill before credits

### Scoring
- Event-strength weighted confidence from Phase 125
- Scope match required when learning has scope columns set
- Primary candidate must be `prefer` direction with prefill-capable variable key

</decisions>
