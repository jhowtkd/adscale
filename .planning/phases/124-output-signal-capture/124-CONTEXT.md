# Phase 124: Output Signal Capture - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 124 creates the canonical capture layer for human output decisions. It normalizes approval, rejection, regeneration, save-reference, and delivery-selection actions into durable evidence records that later phases can aggregate into output learnings.

This phase does not aggregate learnings, project to Mem0, apply recommendations before generation, or build the evaluation gate. Those are Phases 125-128.

</domain>

<decisions>
## Implementation Decisions

### Canonical evidence source
- Create a new canonical evidence store for output decisions instead of using `beta_analytics_events`, `campaignMemory`, or brand memory as the source of truth.
- Existing analytics and memory writes may continue as projections or side effects, but downstream output learning should read from the canonical evidence records.
- The evidence model should be scoped for later aggregation by workspace, client profile, campaign, generation mode, target format, and derivation.

### Evidence shape
- Use append-only evidence records. Each human action creates an immutable event rather than mutating a single "current output signal" row.
- Evidence records should preserve enough context to be auditable and aggregatable later without reinterpreting mutable derivation state.
- Later phases may derive learning status, confidence, contradiction, and supersession from these events; Phase 124 only captures the raw normalized evidence.

### Payload depth
- Store a limited snapshot, not full prompt/model payloads.
- Snapshot should include stable IDs, action, signal direction/strength, source route/action, mode, format, relevant quality fields, and structured reasons when available.
- Do not copy full prompts, raw image payloads, large diagnostic blobs, or unrelated workspace/client data into evidence records.

### Capture failure policy
- Evidence capture must not block the user's primary action. If approval, rejection, regeneration, save-reference, or delivery selection succeeds but evidence insertion fails, the action should still complete.
- Capture failures should be logged with enough identifiers for operator/debug follow-up, without leaking prompt or private payload content.
- Planner may decide whether to implement this with best-effort async writes, try/catch around repository calls, or an internal helper, as long as user workflow is not blocked by evidence telemetry failure.

### Claude's Discretion
- Exact table and repository names.
- Exact enum names for action, signal direction, signal strength, and source.
- Whether Phase 124 includes a small shared recorder helper used by all route call sites.
- Whether to include an idempotency key for retry protection, provided append-only semantics remain clear.
- Focused test split between route tests, repository tests, and pure normalization tests.

</decisions>

<specifics>
## Specific Ideas

- User concern: learned behavior must not degrade by living only in vector memory. Phase 124 should therefore establish the canonical evidence foundation that later learning phases can trust.
- Evidence should support both positive patterns ("prefer this") and negative patterns ("avoid this") later, but Phase 124 should not yet decide final learning statements.
- Existing review route already records campaign memory and brand memory for approvals/rejections. Those records are useful but are not sufficient as canonical learning evidence because they are prompt-oriented and not built for supersession.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/app/api/derivations/[id]/review/route.ts`: central approval/rejection action. It already validates approvability, updates derivation status, emits beta analytics, writes campaign memory, and dispatches brand memory events.
- `app/src/app/api/derivations/[id]/regenerate/route.ts`: central regeneration action. It already resolves structured correction feedback and records campaign memory entries.
- `app/src/app/api/derivations/[id]/save-reference/route.ts`: approved creative save-reference action. It already validates quality and records a brand memory event.
- `app/src/app/api/campaigns/[id]/approval-package/route.ts`: delivery/package selection path that can emit delivery-related output evidence.
- `app/src/server/beta-analytics/record.ts`: established pattern for validated event recording with workspace/campaign/derivation ownership checks.
- `app/src/server/performance/learning/service.ts` and `app/src/server/db/schema.ts`: canonical learning pattern with Postgres source of truth, evidence arrays, status, confidence, and algorithm version. Phase 124 should not implement learning aggregation, but should shape evidence so Phase 125 can mirror this pattern.

### Established Patterns
- API routes use `requireWorkspaceAccess`, Zod request validation, `apiError`, and `handleApiError`.
- Workspace and entity ownership validation is mandatory before writing records tied to campaigns or derivations.
- Existing memory systems are best-effort projections, not hard blockers for primary user actions.
- Feedback and analytics systems sanitize payloads and avoid storing raw prompts/secrets; Phase 124 evidence should follow the same privacy boundary.

### Integration Points
- Review PATCH route for `approved` and `rejected` output decisions.
- Regenerate POST route for correction/retry signals.
- Save-reference POST route for strong positive reference signals.
- Approval-package route for delivery selection signals.
- Drizzle schema, migration, repository layer, and focused tests for the canonical evidence table.

</code_context>

<deferred>
## Deferred Ideas

- Aggregating output evidence into approved/superseded learnings — Phase 125.
- Projecting output learnings to Mem0 — Phase 125.
- Applying output learnings before generation as recommendation/prefill — Phase 126.
- Safety policy that prevents learned preferences from overriding v12.3 factual contracts — Phase 127.
- Fixed output-learning evaluation and release gate — Phase 128.
- Blending imported media performance with output decision signals — future milestone requirement `PERFOUT-*`.

</deferred>

---

*Phase: 124-output-signal-capture*
*Context gathered: 2026-06-16*
