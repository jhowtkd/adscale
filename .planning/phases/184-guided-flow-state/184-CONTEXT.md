# Phase 184: Guided Flow State - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto (recommended defaults selected)

<domain>
## Phase Boundary

Persist guided assistant journey state in a dedicated, scoped, resumable model. This phase delivers the database schema, repository layer, API endpoints and validation for guided-flow state — not the entry UX (Phase 185), path-specific logic (Phases 186–187), or action wiring (Phase 188).

</domain>

<decisions>
## Implementation Decisions

### Storage model
- Dedicated `assistant_guided_flows` table (FLOW-01), not JSON columns on `assistant_threads`
- One guided flow per thread (unique constraint on `thread_id`); create on first path selection, upsert on resume
- Denormalize `workspace_id` and `client_profile_id` on the flow row for scoped queries and validation

### Path and status enums
- **Path:** `existing_creative` | `from_zero` | `unclassified` (for freeform entry before classification in Phase 185)
- **Status:** `active` | `completed` | `abandoned` | `blocked`
- **Current step:** string key per path (e.g. `select_creative`, `collect_brief`, `await_diagnosis`); extensible without schema migration

### State payload shape (FLOW-02)
- `slots`: JSONB object for collected field values (brief fields, diagnosis summary, etc.)
- `missingFields`: JSONB string array of required slot keys still empty
- `assetIds`: JSONB UUID array for linked creative assets
- `referenceIds`: JSONB UUID array for visual references
- `campaignId`: optional UUID FK, nullable until path logic creates/links campaign (Phases 186–187)

### Scope and isolation (FLOW-03)
- Every repository read/write validates `workspaceId`, `clientProfileId` and `threadId` match the flow row
- Cross-workspace, cross-client and cross-thread mutations throw `GuidedFlowValidationError` (mirror `AssistantThreadValidationError` pattern)
- API routes derive scope from authenticated session + thread lookup; reject mismatched path params

### Safe persistence (FLOW-04)
- Reuse `PERSISTENCE_DENYLIST` and `containsDeniedPersistenceKeys` from `assistant-types.ts` on all JSONB writes (`slots`, patches)
- Reject payloads containing `reasoning`, `thinking`, `rawArgs`, `signedUrl`, `internalEvidence` at repository boundary

### API surface
- Nested under existing assistant thread routes: `GET/PATCH /api/assistant/threads/[threadId]/guided-flow`
- `GET` returns current flow or 404 if none; `PATCH` creates (if absent) or updates with validated partial patch
- Include guided-flow summary in thread detail response (`GET /api/assistant/threads/[threadId]`) for resume UX in Phase 185

### Migration
- New Drizzle migration following `0057_assistant_conversation.sql` conventions
- FK cascade: delete flow when thread deleted

### Claude's Discretion
- Exact step key naming conventions per path (document in types, not DB enum)
- Index choices beyond workspace/thread uniqueness
- Whether PATCH accepts full replace vs merge for `slots` (recommend shallow merge)
- Test file organization (repository tests + route tests)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assistant_threads`, `assistant_messages`, `assistant_action_records` schema (Phase 178) — same workspace/client scoping pattern
- `assistant-thread.ts` repository — validation, scoped queries, `AssistantThreadValidationError`
- `assistant-types.ts` — `PERSISTENCE_DENYLIST`, `containsDeniedPersistenceKeys`
- `assistant-action.ts` — transaction pattern for atomic message+record writes
- API routes under `app/src/app/api/assistant/threads/[threadId]/` — auth + workspace middleware pattern

### Established Patterns
- Drizzle schema in `app/src/server/db/schema.ts`, migrations in `app/drizzle/`
- Repository layer in `app/src/server/repositories/` with typed validation errors
- Route tests co-located as `route.test.ts` beside handlers
- Workspace isolation: every query filters by `workspaceId` from session

### Integration Points
- Thread detail hook (`useAssistantThread`) will consume guided-flow in Phase 185
- Orchestrator (`orchestrator.ts`) may read/update flow in later phases; Phase 184 exposes repository only
- Campaign linking via optional `campaignId` aligns with `linkThreadToCampaign` pattern

</code_context>

<specifics>
## Specific Ideas

- Follow v13.5 assistant persistence contracts: no provider reasoning in stored payloads
- Requirements FLOW-01..04 are locked; success criteria from ROADMAP are acceptance targets
- Portuguese user-facing errors can wait for Phase 185; Phase 184 uses typed server errors

</specifics>

<deferred>
## Deferred Ideas

- Entry cards and path classification UI — Phase 185
- Existing-creative upload/select and diagnosis — Phase 186
- From-zero brief collection and 3-reference minimum — Phase 187
- Action card integration and UAT smoke — Phase 188
- Drop-off analytics (OPS-01) — future milestone

</deferred>

---

*Phase: 184-guided-flow-state*
*Context gathered: 2026-06-26*
