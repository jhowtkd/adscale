# Phase 206: Version Compare and Approval - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Let users select and compare two versions from the same plan or creative lineage, understand semantic or visual differences, and explicitly approve or promote an eligible version as the official current artifact. Comparison is read-only. Promotion preserves immutable history, synchronizes the canonical artifact used outside the assistant, rejects stale or cross-lineage state, and recovers from concurrent changes without silently retrying. Telemetry and full browser/UAT coverage remain Phase 207.

</domain>

<decisions>
## Implementation Decisions

### Comparison entry and version selection
- **D-01:** Version history lives persistently in the assistant context panel, with shortcuts from chat messages that created a version.
- **D-02:** Opening comparison preselects approved current versus working selection when they differ. If there is no distinct pair, the user chooses the second version explicitly.
- **D-03:** Detailed comparison opens in a wide responsive surface over the chat and restores the user's chat scroll position when closed.
- **D-04:** History is a linear timeline, not a branch tree. Each entry identifies version number, approved/working/previously-approved status, creation time, origin, and feedback summary.
- **D-05:** Selection and comparison are restricted to two versions from the same lineage and never mutate approved or working pointers.

### Semantic plan comparison
- **D-06:** Show changed fields by default and provide a control to reveal unchanged fields.
- **D-07:** Render each changed field as before/after: two columns on desktop and stacked sections on mobile, with additions, removals, edits, and moves distinguished.
- **D-08:** Ordering is semantically meaningful for angles, hooks, and CTAs. Reordering must appear as a change rather than being normalized away.
- **D-09:** Compare fields in the canonical plan order: strategy, angles, hooks, CTAs, constraints.
- **D-10:** The comparison header shows version number, status, date, and triggering feedback. Internal IDs and technical provenance stay out of the primary user surface.

### Visual creative comparison
- **D-11:** Show previews side by side on desktop and stacked on mobile, with persistent headers identifying each version.
- **D-12:** Start with the complete image fitted in view. Zoom and pan are synchronized so both previews inspect the corresponding region.
- **D-13:** Show decision-relevant metadata: version/status, format and dimensions, bound plan version, CTA, date, and triggering feedback. Hide technical IDs.
- **D-14:** Explain changes using persisted triggering feedback and intended changes, explicitly labeled as intent. Do not run a new visual AI analysis or claim detected pixel-level differences.
- **D-15:** If a preview cannot be loaded, retain the version and safe metadata in the comparison with a recoverable preview error; do not substitute a signed URL into persisted state.

### Approval, promotion, and conflicts
- **D-16:** Approving or promoting synchronizes the lineage approved-current pointer and the canonical plan/creative used outside the assistant in one operation, while immutable version snapshots and history remain unchanged.
- **D-17:** Promotion requires an explicit no-credit confirmation modal showing current version to selected version, canonical writes, and proposals that will become stale.
- **D-18:** Eligible targets are `ready` or previously approved versions. Pending, running, failed, canceled, invalid, cross-lineage, or cross-scope versions cannot be promoted.
- **D-19:** After promotion, the promoted version becomes both approved current and working selection; the prior official version is labeled previously approved; proposals based on the prior head become stale rather than being deleted.
- **D-20:** A creative promotion also promotes the exact plan version that generated it. This is a compound all-or-nothing operation: both artifacts are validated and updated atomically, or neither changes.
- **D-21:** Before compound creative+plan promotion is enabled, the user must separately open and review the comparison for the linked plan version against the current official plan.
- **D-22:** The compound confirmation must identify both plan and creative transitions and must not charge credits.
- **D-23:** On revision/CAS conflict, reload canonical state, keep the comparison open, explain what changed, and require a fresh confirmation. Never auto-retry promotion against the new head.

### the agent's Discretion
- Exact component split for timeline, selectors, wide comparison surface, plan diff blocks, image viewer, and confirmation modal.
- Exact API route names and request envelopes, provided selection is read-only and promotion uses scoped revision checks.
- How the mandatory linked-plan comparison is represented as a server-verifiable acknowledgement rather than a client-only flag.
- Exact mechanism used to resolve short-lived preview URLs at read time.
- Copy, icons, spacing, loading skeletons, and accessible keyboard/focus behavior consistent with existing assistant UI patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/PROJECT.md` — v13.9 goal, guiding principle, and product boundary.
- `.planning/REQUIREMENTS.md` — COMP-01, COMP-02, APPR-01, APPR-02, and APPR-03 acceptance scope.
- `.planning/ROADMAP.md` — Phase 206 goal, dependencies, and success criteria.

### Versioning and iteration decisions
- `.planning/phases/203-artifact-version-foundation/203-CONTEXT.md` — approved-current versus working selection, linear lineage, immutable history, scope, and CAS recovery decisions.
- `.planning/phases/204-plan-iteration-loop/204-CONTEXT.md` — plan proposal/confirmation semantics and deferred compare/promotion behavior.
- `.planning/phases/205-creative-iteration-loop/205-CONTEXT.md` — creative revision lifecycle, plan-version binding, credit behavior, and deferred approval behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/lib/assistant/artifact-version.ts`: typed plan/creative snapshots, version summaries, lineage presentation, approved current, working selection, and proposal summaries.
- `app/src/server/repositories/artifact-version.ts`: scoped lineage/version reads, revision-based `updateArtifactHead`, immutable version storage, and conflict errors.
- `app/src/server/assistant/artifact-version/service.ts`: thread-level lineage presentation and reload state assembly.
- `app/src/server/assistant/plan-iteration/diff.ts`: existing semantic plan-field detector; it must be extended because its current sorting intentionally ignores list reordering.
- `app/src/components/assistant/AssistantContextPanel.tsx`: persistent right-side surface where the version timeline and comparison entry belong.
- `app/src/components/assistant/AssistantActionCard.tsx`: chat-level shortcut/action precedent and status/error presentation patterns.

### Established Patterns
- Every artifact read/mutation is scoped by workspace, client profile, campaign, and assistant thread.
- Immutable full snapshots and allowlisted provenance are canonical; sensitive provider/prompt data and signed URLs are rejected at persistence boundaries.
- Head mutations use revision compare-and-swap and return canonical head state on conflict.
- Approved current and working selection are separate pointers; version creation does not auto-approve.

### Integration Points
- Extend the thread artifact-version API beyond GET/adopt with read-only comparison data and scoped promotion commands.
- Add timeline/history state to `AssistantContextPanel` and shortcuts from version-producing chat messages/action cards.
- Resolve creative preview URLs at read time from the stored output key or derivation reference.
- Promotion must coordinate lineage heads with the mutable canonical `creative_plans` or `derivations` records in one transaction boundary.
- Compound creative approval must validate and promote the bound plan lineage before committing either canonical change.

</code_context>

<specifics>
## Specific Ideas

- The history should feel like a linear evolution timeline, while still clearly marking approved current, working, and previously approved versions.
- Comparison is a focused workspace temporarily layered over the conversation, not a dense block inside the message stream.
- Creative change summaries must say what was requested/intended, not claim that AI re-inspected and proved visual differences.
- Creative approval is intentionally coupled to its exact generating plan; the user must inspect that plan comparison before the atomic combined promotion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 206 scope.

</deferred>

---

*Phase: 206-version-compare-and-approval*
*Context gathered: 2026-06-28*
