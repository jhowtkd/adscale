# Phase 157: Global Corpus Access Boundary - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 157 defines and implements the access/scoping boundary for global corpus operations. It should let platform owners operate the quality corpus globally, preserve workspace-scoped behavior for explicit workspace access, and ensure evaluation writes resolve workspace context server-side. Candidate capture, rich queue filtering, global preview fixes and analytics belong to later phases unless needed as minimal scaffolding for this access boundary.

</domain>

<decisions>
## Implementation Decisions

### Global vs Workspace Scope
- Platform owner should see **Global** as the default corpus mode; the owner should not need to enter a workspace ID before using the corpus panel.
- The same API surface should remain backward compatible: calls with `workspaceId` stay workspace-scoped; calls without `workspaceId` mean global only for platform owners.
- Do not introduce separate `/global-*` routes in this phase unless planning discovers a hard technical blocker.
- Non-owner users must not get global mode. Workspace admins can only use explicitly scoped workspace access.

### Workspace Admin Boundary
- Workspace admins may retain scoped calibration/corpus access only when `workspaceId` is explicit and authorized.
- Platform-owner access remains the only global access path.
- Existing workspace isolation stays non-negotiable: no customer/user-facing path can list or evaluate another workspace's corpus items.

### Evaluation Write Boundary
- Global evaluation submit must not trust a browser-provided `workspaceId`.
- In global mode, the client should submit evaluation fields plus `corpusItemId`; the server resolves `workspaceId` from the corpus item before writing `human_quality_evaluations`.
- Workspace-scoped evaluation can remain backward compatible, but server-side verification must ensure any provided workspace matches the corpus item.
- Stale, duplicate or non-pending item evaluation attempts should keep returning clear 404/409-style errors and must not corrupt corpus status.

### UI Scope for Phase 157
- Include a full scope toggle in `HumanQualityCorpusPanel`: a compact segmented control with `Global` and `Workspace`.
- `Global` is default for platform owner.
- `Workspace` mode can keep the existing manual Workspace ID input; workspace search/listing is deferred.
- If global mode has no items yet, show a short operational empty state explaining that global candidate capture is coming in Phase 158. Do not hide the queue and do not show a long setup checklist.

### Denied Access and Audit
- API denial for non-owner global access should be a generic `403 forbidden`; do not disclose whether a global corpus exists or whether items exist.
- Add lightweight server-side security logs for global list/evaluate actions: userId, route/action, item id or count where applicable, no payloads, prompts, signed URLs, storage keys or raw notes.
- Do not add a persistent DB audit table in this phase.

### Test Focus
- Prioritize API/unit tests for the access boundary: platform owner global success, non-owner global 403, workspace admin scoped behavior, backward compatibility with `workspaceId`, and server-resolved evaluation workspace.
- UI tests should cover the segmented control only if they are low-cost and directly guard the Phase 157 behavior.
- Full browser E2E is deferred until the global queue/review surface is complete enough in later phases.

### Claude's Discretion
- Exact naming of query params, helper functions and test fixture IDs.
- Exact visual styling of the segmented control, as long as it follows existing compact operational UI patterns.
- Whether to implement the server-resolved evaluation as a new service function or a backward-compatible option on the existing service, provided the security boundary is explicit and tested.

</decisions>

<specifics>
## Specific Ideas

- The owner experience should feel like a control plane: Global first, Workspace as a narrower diagnostic mode.
- Preserve backward compatibility for existing tests and internal workspace-specific flows where practical.
- Phase 157 should unblock planning for later global candidate capture, but should not try to solve capture, prioritization or analytics yet.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/auth/platform-owner.ts`: `requirePlatformOwner()` and `isPlatformOwnerEmail()` already implement platform-owner identity from `PLATFORM_OWNER_EMAILS` and dev admin emails.
- `app/src/server/auth/calibration-access.ts`: `requireCalibrationAccess()` already distinguishes `platform-owner` from `workspace-admin`; useful pattern for global-or-scoped routes.
- `app/src/app/api/feedback/human-quality-corpus/route.ts`: current corpus GET/POST route is owner-only but requires `workspaceId` for GET; this is the main global-scope entry point.
- `app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.ts`: current evaluation POST requires `workspaceId` in body and passes it to `submitHumanEvaluation`; this is the core boundary to change.
- `app/src/server/repositories/human-quality-corpus.ts`: current repository methods filter by workspace for pending queue and item lookup; global variants or optional workspace filters will be needed.
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx`: existing panel already owns the corpus UI, tabs, query invalidation and evaluation form; currently blocked by mandatory Workspace ID.

### Established Patterns
- API errors use `apiError()` and `handleApiError()` with `WorkspaceAuthError` mapping to `401/403`.
- Existing corpus service validates bounded payloads and strips unsafe artifact/quality data; preserve that privacy posture.
- Prior calibration phases established source labels and claim blocking: fixture-only evidence cannot support customer-real claims.
- Owner feedback surfaces in `/feedback` use compact operational controls rather than customer-facing marketing copy.

### Integration Points
- `HumanQualityCorpusPanel` should become scope-aware before later phases add capture/filter depth.
- Corpus repository/service should expose a clear global owner read path and a server-resolved evaluation write path.
- Route tests under `app/src/app/api/feedback/human-quality-corpus*.test.ts` are the immediate regression surface.
- Later phases will build on this by adding global candidates, mixed-workspace preview signing, feedback artifacts and evidence reports.

</code_context>

<deferred>
## Deferred Ideas

- Workspace search/listing UI for scope selection — defer beyond Phase 157 unless it becomes trivial with existing data.
- Candidate capture for every completed creative — Phase 158.
- Rich global filters, priority ordering and mixed-workspace preview signing — Phase 159.
- Structured improvement feedback artifacts — Phase 160.
- Global evidence dashboard and release gate — Phase 161.
- Persistent DB audit table — defer until there is a concrete compliance need.
- Full browser E2E for the global corpus flow — defer until queue and evaluation UX are complete.

</deferred>

---

*Phase: 157-global-corpus-access-boundary*
*Context gathered: 2026-06-20*
