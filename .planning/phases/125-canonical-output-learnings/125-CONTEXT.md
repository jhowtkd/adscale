# Phase 125: Canonical Output Learnings - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning (autonomous decisions)

<domain>
## Phase Boundary

Phase 125 aggregates canonical `output_decision_events` evidence into durable `client_output_learnings` records with confidence, contradiction handling, supersession, and Mem0 projection for approved learnings only. Postgres remains the source of truth.

This phase does not apply learnings before generation (Phase 126), enforce factual-contract safety (Phase 127), or run the release gate (Phase 128).
</domain>

<decisions>
## Implementation Decisions

### Canonical learning store
- Create `client_output_learnings` table mirroring `client_performance_learnings` shape adapted for output-quality signals.
- Learning identity: `workspace_id` + `client_profile_id` + `variable_key` + `variable_value` + `scope_generation_mode` + `scope_format`.
- Use empty string sentinel for unscoped (any) mode/format in unique index to avoid PostgreSQL NULL uniqueness gaps.

### Bounded variable keys
- Support only: `cta`, `generation_mode`, `format`, `style_policy`, `avoid_pattern`.
- `avoid_pattern` derives from structured rejection/regeneration reason codes on negative/corrective actions.
- No prompt prose mutation; statements are human-readable summaries of bounded variables only.

### Evidence aggregation
- Read append-only `output_decision_events` for client profile within workspace.
- Map `positive` direction to supporting polarity for preference variables; `negative`/`corrective` to contradicting.
- For `avoid_pattern`, negative/corrective actions produce supporting evidence (pattern to avoid).
- Weight evidence by signal strength: strong=1.0, medium=0.6, weak=0.3.

### Confidence and status
- Reuse performance-learning confidence thresholds adapted for event counts (no impressions).
- Status rules: `approved` when supporting dominates and confidence not low; `superseded` when contradicting outweighs supporting on previously approved rows; `draft` when insufficient; `removed` when no matching evidence remains.
- `algorithmVersion` = `1.0.0` for initial output-learning algorithm.

### Scoping (LEARN-04)
- Learnings scoped per workspace and client profile; mode/format scope columns prevent cross-context leakage.
- Evidence from incompatible mode/format does not merge into a scoped learning group.

### Mem0 projection (LEARN-05)
- Project only `approved` learnings to Mem0 with `memoryType: output_learning`.
- Delete Mem0 entries on `removed` or `superseded`; Postgres row retains audit trail.
- Projection is best-effort and non-blocking.

### Recompute triggers
- Dedicated `POST /api/client-profiles/[id]/output-learnings` with `{ action: "recompute" }`.
- Best-effort async recompute after evidence insert via dispatch helper (mirrors performance-learning dispatch).
- Recompute failures never block evidence capture or user actions.

### Claude's Discretion
- Exact statement wording in Portuguese (match performance-learning tone).
- Test split between aggregate, confidence, repository sync, and service dispatch.
- Whether to expose GET list vs search in Phase 125 (include GET list mirroring performance route).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/performance/learning/*`: aggregate, confidence, types, service, variable-value patterns.
- `app/src/server/repositories/client-learning.ts`: sync upsert/remove transaction pattern.
- `app/src/server/memory/performance-learning-projection.ts`: Mem0 projection pattern.
- `app/src/server/output-learning/output-decision-events.ts`: evidence contract from Phase 124.
- `app/src/server/repositories/output-decision-event.ts`: evidence queries.
- `app/src/app/api/client-profiles/[id]/learnings/route.ts`: recompute API pattern.

### Integration Points
- `recordOutputDecisionEvidenceBestEffort` → dispatch output learning recompute.
- New repository `client-output-learning.ts`.
- New service `output-learning/service.ts` with `recomputeClientOutputLearnings`.
- Migration `0042_client_output_learnings.sql`.

</code_context>

<deferred>
## Deferred Ideas

- Applying output learnings as recommendation/prefill before generation — Phase 126.
- Factual-contract override safety — Phase 127.
- Evaluation gate and release criteria — Phase 128.

</deferred>

---

*Phase: 125-canonical-output-learnings*
*Context gathered: 2026-06-16*
