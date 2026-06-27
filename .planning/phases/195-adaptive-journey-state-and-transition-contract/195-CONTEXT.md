# Phase 195: Adaptive Journey State and Transition Contract - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Mode:** Auto (recommended defaults selected)

<domain>
## Phase Boundary

Establish the versioned journey state model, typed server-owned commands, deterministic transitions, optimistic concurrency, and conflict recovery for both guided paths. This phase delivers persistence migration, the guided-conversation domain layer, and the commands API — not progressive briefing UI (Phase 196), collaborative diagnosis UX (Phase 197), inline assets (Phase 198), action/a11y UAT (Phase 199), or release gate (Phase 200).

</domain>

<decisions>
## Implementation Decisions

### State envelope
- Add `revision` (integer, default 0) and `schemaVersion` (integer, default 1) columns to `assistant_guided_flows`
- Add optional `recoverableError` JSONB for last safe failure the user can retry from
- Parse persisted rows through Zod path/step schemas on every read and before write (FLOW-01)
- Keep canonical answers and navigation metadata in typed `slots`; do not expose raw `Record<string, unknown>` to UI

### Command API
- New `POST /api/assistant/threads/[threadId]/guided-flow/commands` accepts `{ commandId, expectedRevision, command }` (FLOW-02, FLOW-07)
- Commands: `select_path`, `back`, `switch_path`, `restart`, `edit_field`, `clear_error`, `preview_switch`, `preview_restart`
- Deprecate client-selected `currentStep`/`path` on generic PATCH; retain GET and limited PATCH for backward compatibility during migration
- Free-text chat turns route through the same interpreter → command path in orchestrator (FLOW-07)

### Transitions
- Pure `transition(state, command)` reducer in `guided-conversation/transition.ts` with exhaustive path/step guards
- Path definitions in `definitions/existing-creative.ts` and `definitions/from-zero.ts` declare legal steps, back targets, and stale-field rules
- `edit_field` preserves unrelated confirmed answers and marks dependent diagnosis/readiness/proposals stale (FLOW-04)

### Concurrency and recovery
- Compare-and-swap updates: `WHERE id = ? AND revision = expectedRevision`; increment revision on success; return `409` with fresh state on conflict (FLOW-06)
- Append transition audit row in same DB transaction as flow update
- `preview_switch` / `preview_restart` return retention/clear lists without mutating state (FLOW-05)

### Resume
- GET returns parsed state including current question descriptor, answers, resources, review flags, and recoverable error (FLOW-03)

### Migration
- `0062_assistant_guided_flow_adaptive_state.sql` for revision/schema_version/recoverable_error + `assistant_guided_flow_transitions` audit table
- Existing flows default to revision 0 and schemaVersion 1 with legacy slot shape migrated on first read

### Claude's Discretion
- Exact stale-field dependency maps per path (document in definitions)
- Transition audit metadata allowlist (mirror telemetry sanitizer)
- Whether generic PATCH logs a deprecation warning in tests only

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assistant_guided_flows` table and `guided-flow.ts` repository — scope validation, shallow slot merge, telemetry lifecycle hook
- `guided-paths/from-zero.ts` and `existing-creative.ts` — fixed step transitions and slot shapes to wrap behind definitions
- `guided-flow-telemetry` — extend with transition events after commit
- `lib/guided-flow/types.ts` — path enums and initial steps

### Established Patterns
- Drizzle migrations in `app/drizzle/` with journal registration
- Repository validation errors → 400; scope mismatch → 400
- Route tests co-located; table-driven Vitest for domain logic
- STACK.md / ARCHITECTURE.md research — no new packages; event command API with revision

### Integration Points
- `orchestrator.ts` — journey-first turn handling before generic intent
- `use-guided-flow.ts` — add commands mutation with revision and conflict refetch
- Existing path routes delegate to guided-conversation service over time

</code_context>

<deferred>
## Deferred Ideas

- Progressive one-question briefing UI — Phase 196
- Diagnosis assumption correction panels — Phase 197
- Inline upload/replace/retry — Phase 198
- Action card snapshot digest binding — Phase 199

</deferred>

---

*Phase: 195-adaptive-journey-state-and-transition-contract*
*Context gathered: 2026-06-27*
