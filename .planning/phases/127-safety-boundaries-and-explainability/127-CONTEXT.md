# Phase 127: Safety, Boundaries, and Explainability - Context

**Gathered:** 2026-06-16
**Status:** Ready for execution

<domain>
## Phase Boundary

Phase 127 enforces that approved output learnings cannot override v12.3 factual-preservation contracts, never authorize changes from Mem0 relevance alone, and remain auditable via structured traces.

Does not implement Phase 128 evaluation gate or prompt prose mutation.
</domain>

<decisions>
## Implementation Decisions

### Safety module
- `app/src/server/output-learning/safety/types.ts` — AppliedLearningTrace, BlockedPrefillField
- `app/src/server/output-learning/safety/guards.ts` — filterApprovedPostgresLearnings, guardOutputLearningPrefill, buildAppliedLearningTrace

### SAFE-01 guards
- Block format_adaptation prefill on restyling campaigns (factual base/style separation)
- Cap creative level when readiness blocked; force safe_iteration recipe
- Cap format_adaptation creative level at balanced (campaign identity lock)

### SAFE-02
- `filterApprovedPostgresLearnings` after repository fetch — no Mem0 read path

### SAFE-03
- `appliedLearningTrace` on recommendation payload with evidence event IDs
- Structured server log via `logAppliedLearningTrace`
- Beta accept event includes traceId + evidenceEventCount

### SAFE-04
- avoid_pattern entries in trace marked `applied: false` with guardCode `avoid_pattern_hint_only`
</decisions>
