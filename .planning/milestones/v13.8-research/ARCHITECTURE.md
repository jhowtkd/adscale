# Architecture Research

**Domain:** Adaptive guided conversation inside the existing ADScale assistant
**Researched:** 2026-06-26
**Confidence:** HIGH

## Standard Architecture

### System Overview

The adaptive capability should be an application/domain layer around the existing
`assistant_guided_flows` aggregate. The model may interpret an answer and generate
suggestions, but only a deterministic transition engine may change journey state.

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ React assistant UI                                                        │
│ Journey prompt · quick replies · editable summary · asset/reference cards │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ command or chat turn
┌───────────────────────────────▼───────────────────────────────────────────┐
│ Next.js assistant routes                                                  │
│ guided-flow/commands                    chat (SSE)                         │
└──────────────────────┬───────────────────────────────┬────────────────────┘
                       │                               │
┌──────────────────────▼───────────────────────────────▼────────────────────┐
│ Guided conversation application layer                                     │
│ Command handler · turn interpreter · presenter · action snapshot guard     │
└──────────────────────┬───────────────────────────────┬────────────────────┘
                       │ validated command             │ context/prompt only
┌──────────────────────▼──────────────────┐  ┌─────────▼────────────────────┐
│ Deterministic journey state machine     │  │ Existing chat orchestrator  │
│ path definitions · guards · transitions│  │ model · tools · action cards│
└──────────────────────┬──────────────────┘  └─────────┬────────────────────┘
                       │ atomic transition              │ propose/confirm
┌──────────────────────▼────────────────────────────────▼────────────────────┐
│ Existing repositories and execution layer                                 │
│ guided flow · transition log · messages · actions · campaigns · assets     │
└──────────────────────┬────────────────────────────────┬────────────────────┘
                       │                                │ best-effort derived
┌──────────────────────▼──────────────────┐  ┌──────────▼───────────────────┐
│ PostgreSQL canonical state             │  │ Existing guided telemetry    │
│ flow row + transition audit            │  │ funnel/events/feedback       │
└─────────────────────────────────────────┘  └──────────────────────────────┘
```

### Component Responsibilities

| Component | New / Modified | Responsibility | Recommended implementation |
|-----------|----------------|----------------|----------------------------|
| `guided-conversation/state.ts` | New | Versioned, typed state envelope shared by both paths | Zod discriminated union keyed by `path`; keep path-specific answers and asset/reference state in `slots` |
| `guided-conversation/definitions/*` | New | Declare steps, required fields, allowed commands, back targets, completion guards, and presentation hints | Pure TypeScript definitions for `existing_creative` and `from_zero` |
| `guided-conversation/transition.ts` | New | Apply one command to one state and return next state plus domain effects | Pure reducer; exhaustive command/result unions; no DB, model, or telemetry calls |
| `guided-conversation/service.ts` | New | Scope, validate, persist, emit messages/effects, and return a presentation model | Server-only application service wrapping repository transactions |
| `guided-conversation/interpreter.ts` | New | Convert a free-text turn into a proposed journey command when a journey question is active | Deterministic handling for quick replies/navigation; structured model extraction only for open text |
| `guided-conversation/presenter.ts` | New | Produce the current prompt, quick replies, progress, editable summary, and allowed controls | Server-generated serializable view model; UI must not reproduce transition rules |
| `guided-flow.ts` repository | Modified | Persist canonical state with optimistic concurrency and transition audit | Add `revision`; compare-and-swap update; append transition in same DB transaction |
| `assistant_guided_flow_transitions` | New | Durable audit/idempotency record for back/edit/switch/restart/resume | Append-only table; command ID unique per flow; safe field names/counts only, no raw prompt or reasoning |
| `guided-flow/commands` route | New | Single mutation boundary for UI journey commands | `POST` with Zod discriminated union and `expectedRevision`/`commandId` |
| Existing guided-flow routes | Modified | Delegate mutations to the service; retain compatibility during migration | Stop accepting arbitrary `currentStep`, `path`, and `slots` patches from clients |
| `orchestrator.ts` | Modified | Give an active journey first right of refusal on each chat turn | Interpret/advance flow before generic intent classification; fall through only for non-journey turns |
| Path modules | Modified | Supply path effects and prompt context, not direct ad hoc transitions | Reuse diagnosis, briefing mapping, and action augment logic behind definitions/effects |
| Action contracts / confirmation | Modified | Bind proposed execution to the exact reviewed journey snapshot | Add `guidedFlowId`, `guidedFlowRevision`, and snapshot digest to action input; revalidate on confirm |
| Telemetry lifecycle | Modified | Observe adaptive behavior without owning state | Emit events after committed transitions; preserve existing funnel events and add bounded adaptive events |
| Assistant journey UI | Modified | Render one conversational decision at a time with inline corrections | Replace fixed brief form and acknowledgement-only diagnosis with generic prompt/summary/control components |

## Recommended Project Structure

```text
app/src/
├── lib/guided-flow/
│   ├── types.ts                         # Public path/status types and typed state DTOs
│   └── commands.ts                      # Shared command and presentation contracts
├── server/assistant/guided-conversation/
│   ├── state.ts                         # Versioned state parsing/migration
│   ├── transition.ts                    # Pure deterministic reducer
│   ├── service.ts                       # Transactional command application
│   ├── interpreter.ts                   # Chat turn -> proposed command
│   ├── presenter.ts                     # State -> UI/chat view model
│   ├── effects.ts                       # Diagnosis, asset and action side-effect ports
│   └── definitions/
│       ├── existing-creative.ts
│       └── from-zero.ts
├── server/repositories/
│   ├── guided-flow.ts                   # CAS state writes and scoped reads
│   └── guided-flow-transition.ts        # Append-only transition audit
├── app/api/assistant/threads/[threadId]/
│   ├── chat/route.ts                    # Existing SSE transport
│   └── guided-flow/
│       ├── route.ts                     # Read/temporary compatibility endpoint
│       └── commands/route.ts             # New command mutation endpoint
└── components/assistant/guided/
    ├── GuidedConversationTurn.tsx       # Current question/suggestion/quick replies
    ├── GuidedSummary.tsx                # Editable reviewed facts
    ├── GuidedNavigation.tsx             # Back/switch/restart controls
    ├── GuidedAssetPicker.tsx             # Select/replace/retry asset
    └── GuidedReferencePicker.tsx         # Add/remove/replace references inline
```

### Structure Rationale

- **`guided-conversation/`:** keeps adaptive state rules independent from HTTP,
  React, model providers, and campaign repositories. Both chat text and UI controls
  issue the same commands.
- **Path definitions:** share infrastructure while keeping `existing_creative` and
  `from_zero` guards explicit. Avoid one reducer full of path-specific conditionals.
- **Separate transition audit:** operational telemetry is fire-and-forget and may
  fail by design. It cannot support correctness, idempotency, undo, or debugging.
- **Generic guided UI:** the server returns allowed controls and display data;
  React renders them and invalidates the existing thread query after commands.

## Architectural Patterns

### Pattern 1: Versioned Aggregate With Explicit Commands

**What:** Keep one active flow per thread, but mutate it only through commands such
as `answer`, `accept_suggestion`, `edit_field`, `back`, `switch_path`, `restart`,
`select_asset`, `replace_asset`, `add_reference`, `remove_reference`, and
`acknowledge_summary`.

**When to use:** Every journey mutation, whether initiated by quick reply, inline
control, upload, or free-text chat.

**Trade-offs:** More domain code than arbitrary PATCH requests, but transitions
become testable, race-safe, auditable, and identical across UI and chat.

```typescript
type GuidedCommand =
  | { type: "answer"; field: BriefField; value: string }
  | { type: "edit_field"; field: BriefField; value: string }
  | { type: "back" }
  | { type: "switch_path"; path: "existing_creative" | "from_zero" }
  | { type: "restart" }
  | { type: "replace_asset"; workspaceAssetId: string };

type CommandEnvelope = {
  commandId: string;
  expectedRevision: number;
  command: GuidedCommand;
};
```

The transition result should include `nextState`, `changedFieldKeys`, and declared
effects. Raw user text is stored as the user message under existing message policy;
the transition audit stores only bounded structural metadata.

### Pattern 2: Model as Interpreter, Never as State Owner

**What:** If a flow is active, the orchestrator first asks the guided interpreter
whether the turn answers the current question or requests navigation/correction.
The interpreter returns a structured proposed command. The deterministic state
machine validates it before persistence.

**When to use:** Open-text answers, corrections such as "troque o público para...",
and ambiguous natural-language navigation.

**Trade-offs:** A user turn can require one extraction call before the normal model
response. In return, provider prose cannot silently advance, rewrite, or corrupt the
flow. Use deterministic parsing for explicit UI controls and known quick replies;
invoke model extraction only when needed.

### Pattern 3: Reviewed Snapshot Boundary

**What:** Separate mutable conversation draft from executable action snapshot.
Action cards are proposed only from a reviewed state and carry its revision and
digest. Any upstream edit, asset replacement, reference change, path switch, or
restart supersedes pending cards based on the older revision.

**When to use:** Before campaign creation/update, credit consumption, generation,
memory writes, exports, and long-running jobs.

**Trade-offs:** Users may need to reconfirm after a correction. That is required to
preserve the existing `Propor e confirmar` contract and prevents stale execution.

```typescript
const actionContext = {
  guidedFlowId: flow.id,
  guidedFlowRevision: flow.revision,
  reviewedSnapshotDigest: digest(reviewedSnapshot),
};
```

`revalidateOnConfirm` must reject or supersede the card if the current flow revision
or digest differs. Never mutate an existing pending action's `inputSnapshot` after
it was shown to the user.

### Pattern 4: Transactional State, Derived Telemetry

**What:** Commit the flow row and transition audit atomically. Emit telemetry only
after commit. Message creation should use the same application service and an
idempotent command ID so retries do not double-advance.

**When to use:** Every command, especially double-clicks, reconnects, and competing
tabs.

**Trade-offs:** Requires a repository transaction API and optimistic conflict UI.
It avoids lost updates currently possible when `patchGuidedFlow` merges a stale
`slots` object without a revision check.

## Data Flow

### Conversational Turn

```text
User text / quick reply
    -> chat route or commands route
    -> load thread + flow in workspace/client scope
    -> active-flow interpreter
       -> no journey intent: existing generic assistant orchestration
       -> proposed command: transition engine + guards
    -> atomic CAS state update + transition audit
    -> presenter creates next prompt/summary/controls
    -> persist assistant message and/or return command response
    -> invalidate thread query; SSE continues for model prose when required
    -> emit bounded telemetry after commit
```

The chat route must not classify generic action intent before giving the active
journey a chance to consume the turn. Otherwise an answer such as "Instagram" can
be misclassified as a generic assistant request instead of the current platform
answer.

### `from_zero` Flow

```text
start
  -> ask one missing brief field
  -> answer or accept suggestion (persist immediately)
  -> next relevant field; skip optional fields explicitly
  -> editable brief summary
  -> add/remove/replace >= 3 scoped references
  -> reviewed creative-plan snapshot
  -> existing confirmed action card
  -> execute campaign/generation work
```

Modify `saveFromZeroBrief`: it currently rejects all partial briefs and advances
only when the entire object is complete. Adaptive mode persists one validated field
at a time. Keep `getNextStep`, `buildSuggestion`, and
`mapGuidedAnswersToCampaignDraft` as reusable pure helpers, but make the path
definition the authority for required/optional steps and backward navigation.

### `existing_creative` Flow

```text
start
  -> select/upload asset
  -> analyze into provisional snapshot + diagnosis
  -> discuss uncertain fields/assumptions one at a time
  -> user edits or accepts each premise
  -> editable diagnosis/brief summary
  -> reviewed improvement snapshot
  -> existing confirmed action card
  -> create/update campaign and execute improvement
```

Modify `selectExistingCreative`: today it creates and updates a draft campaign,
links the thread, and creates a campaign asset before the user can correct the
diagnosis. For v13.8, selection and diagnosis should remain provisional in the
guided flow; campaign writes move behind the confirmed action handler. The selected
workspace asset ID may be persisted in the flow, but campaign creation/update must
not occur before review and confirmation.

### State Management

```text
PostgreSQL assistant_guided_flows (canonical snapshot + revision)
    -> thread GET returns guidedFlow + guidedPresentation
    -> React Query cache renders current turn and summary
    -> command mutation sends expectedRevision
    -> server CAS update succeeds or returns conflict + latest presentation
    -> query invalidation refreshes messages, flow, action cards, and controls
```

Resume is reconstruction from canonical state, not inference from message history.
Messages remain conversation evidence; `slots` remain the current domain snapshot;
the transition table records how the snapshot changed; telemetry remains analytics.

## Invariants

1. Exactly one active guided-flow aggregate exists per thread, scoped by
   `workspaceId`, `clientProfileId`, and `threadId`.
2. Only the transition service may change `path`, `status`, `currentStep`, typed
   slots, assets, references, or reviewed revision. Public routes never accept an
   arbitrary next step or raw slots replacement.
3. Every mutation includes `commandId` and `expectedRevision`; duplicate commands
   are idempotent and stale revisions never overwrite newer state.
4. A step advances only when its definition guard passes. Back/edit may invalidate
   downstream derived values, review state, and pending actions, but must preserve
   unrelated accepted answers.
5. Path switch and restart require explicit user intent. Switching archives the
   prior path snapshot in the transition audit; it does not copy incompatible
   path-specific fields or silently delete shared uploaded assets.
6. Model output is untrusted input. It may propose structured values, but Zod and
   transition guards validate them; provider reasoning is never persisted or shown.
7. `existing_creative` diagnosis and briefing are provisional until reviewed.
   Campaign creation/update and all cost-bearing work remain behind action-card
   confirmation.
8. Action cards are immutable reviewed snapshots. Any material flow revision makes
   older pending cards non-confirmable.
9. Asset/reference IDs are resolved server-side in workspace/client scope. Counts
   and IDs in flow state never establish authorization by themselves.
10. Telemetry failure never blocks a valid transition, and telemetry events are
    never used to reconstruct flow state.
11. Resume renders the next valid decision from persisted state after refresh,
    reconnect, or action failure without replaying prior model turns.
12. User corrections are first-class transitions and must be distinguishable from
    initial answers in audit and telemetry without storing sensitive answer text.

## Integration Points

### Existing Boundaries

| Boundary | Integration | Required change |
|----------|-------------|-----------------|
| `assistant_guided_flows` | Canonical snapshot | Add `revision` and versioned typed slots; retain one-row-per-thread uniqueness |
| `assistantGuidedFlowEvents` | Operational telemetry | Extend event vocabulary/metadata allowlist; do not reuse as transition log |
| `runAssistantTurn` | Chat orchestration | Load current presentation and interpret journey turns before generic intent/model path |
| `buildAssistantContext` | Provider context | Include only current reviewed facts, active question, allowed operations, and safe summaries |
| `propose_action` | Confirmation boundary | Include flow revision/digest and supersede stale cards after material edits |
| Confirm route | Execution gate | Revalidate current flow snapshot in addition to existing action contract and role/credit checks |
| Action execution | Completion/failure | Map successful result to a deterministic flow transition; retain blocked/resume behavior on failure |
| Thread GET + React Query | Read model | Return a server-built `guidedPresentation`; continue using existing query invalidation/polling |
| Message list | Conversation history | Add guided prompt/summary message payload variants or render the active turn adjacent to messages |
| Existing panels | UI controls | Fold into generic guided components; do not keep a second client-side state machine |

### Telemetry Extension

Keep current events (`guided_flow_started`, `guided_step_viewed`, input, blocked,
action, abandoned, completed) for funnel continuity. Add bounded events only where
they answer v13.8 product questions:

| Event | Safe metadata |
|-------|---------------|
| `guided_answer_submitted` | `fieldKey`, `inputMode`, `isCorrection` |
| `guided_suggestion_accepted` | `fieldKey`, `suggestionKind` |
| `guided_field_edited` | `fieldKey`, `fromReviewedState` |
| `guided_back_navigated` | `fromStep`, `toStep` |
| `guided_path_switched` | `fromPath`, `toPath` |
| `guided_flow_restarted` | `path`, `hadPendingAction` |
| `guided_asset_replaced` | asset counts only |
| `guided_reference_changed` | reference count and operation |
| `guided_flow_resumed` | `status`, `resumeReason` |

Expand the strict telemetry allowlist for these enumerated keys. Do not emit answer
text, asset keys/URLs, model prompts, provider output, or arbitrary error messages.

## Recommended Build Order

1. **Freeze contracts with state-machine tests.** Define versioned path state,
   commands, transition matrix, invalidation rules, and invariants for both paths.
2. **Harden persistence.** Add flow `revision`, append-only transitions, command
   idempotency, and compare-and-swap repository transactions. Add migration/parsing
   for existing unversioned slot payloads.
3. **Introduce the command service and route.** Move all mutations behind scoped,
   discriminated commands; keep old endpoints as thin compatibility adapters until
   UI migration is complete.
4. **Protect action confirmation.** Bind action cards to flow revision/digest,
   supersede stale pending cards, and transition flow on action success/failure.
5. **Make `from_zero` progressive.** Persist one answer at a time, expose contextual
   suggestions/quick replies, then add editable summary and reference corrections.
6. **Make `existing_creative` collaborative.** Store diagnosis provisionally,
   resolve uncertain premises conversationally, and move campaign writes behind the
   confirmed action boundary.
7. **Integrate chat orchestration.** Add journey-first turn interpretation and
   server-built prompt augment; preserve generic assistant fallback and SSE events.
8. **Replace fixed panels with the generic adaptive UI.** Add back/edit/switch/
   restart, inline upload/reference replacement, conflict recovery, and resume.
9. **Extend telemetry and funnel reporting.** Emit adaptive events from committed
   transitions and retain existing v13.7 event semantics.
10. **Run end-to-end UAT for both paths.** Cover refresh/resume, correction after
    review, stale action confirmation, failed upload/action recovery, path switch,
    restart, duplicate command, and competing-tab revision conflict.

This order establishes concurrency and confirmation safety before exposing edits
that can invalidate downstream work.

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| Current / beta | Keep the Next.js monolith and PostgreSQL repositories; pure transitions and one transaction per command are sufficient |
| Growing usage | Index transition rows by flow/time, cap transition payloads, paginate audit reads, and monitor model extraction latency/error rate |
| High concurrency | Queue expensive diagnosis/effects, retain CAS writes, use an outbox for guaranteed telemetry/effect delivery, and compact old transition metadata |

### Scaling Priorities

1. **First bottleneck:** image diagnosis and model extraction latency, not the state
   machine. Run expensive effects asynchronously with explicit `processing` state
   and idempotent result commands.
2. **Second bottleneck:** thread polling while actions/effects run. Extend existing
   SSE events or targeted invalidation before introducing a separate realtime stack.

## Anti-Patterns

### Letting the Model Choose `currentStep`

**What people do:** Prompt the model to return the next step and persist it directly.
**Why it is wrong:** Provider drift can skip required review, cross confirmation
boundaries, or produce unsupported states.
**Do this instead:** The model proposes extracted values; deterministic guards choose
the transition.

### Treating Messages as Journey State

**What people do:** Reconstruct answers and progress by replaying chat history.
**Why it is wrong:** Messages are prose, can be edited by provider behavior, and do
not provide safe concurrency or explicit correction semantics.
**Do this instead:** Persist typed canonical state and use messages only as history.

### Keeping State in React Panels

**What people do:** Add back/edit logic independently to `FromZeroBriefPanel`,
`CreativeDiagnosisPanel`, and the chat composer.
**Why it is wrong:** Refresh, cross-device resume, and chat-entered corrections diverge
from button-entered changes.
**Do this instead:** All surfaces send the same server commands and render one
presentation model.

### Reusing Telemetry as an Event Store

**What people do:** Infer correction history from `assistant_guided_flow_events`.
**Why it is wrong:** emission is intentionally best-effort and metadata is heavily
sanitized.
**Do this instead:** Add a transactional transition audit and derive telemetry from
committed transitions.

### Executing an Old Action After an Edit

**What people do:** Leave a pending action card confirmable after the user changes
offer, CTA, references, diagnosis, or asset.
**Why it is wrong:** The user confirms a visible state but execution uses an older
snapshot.
**Do this instead:** Revision-bind and supersede action cards; require a fresh review
and confirmation.

### Creating the Campaign During Diagnosis

**What people do:** Keep the current `selectExistingCreative` behavior and update a
campaign before premises are reviewed.
**Why it is wrong:** It conflicts with v13.8's correction-before-write principle and
makes back/switch/restart semantically destructive.
**Do this instead:** Keep analysis provisional in the flow and create/update the
campaign only through confirmed execution.

## Verified Current-State Gaps

| Current behavior | Location | Architectural consequence |
|------------------|----------|---------------------------|
| `currentStep` and `slots` can be patched directly | `guided-flow/route.ts`, `repositories/guided-flow.ts` | Replace arbitrary PATCH mutation with command service and CAS |
| Slot merge has no revision check | `repositories/guided-flow.ts` | Competing tabs can lose updates; add optimistic concurrency |
| From-zero UI submits eight fields together | `FromZeroBriefPanel.tsx` | Replace with one-decision-at-a-time presentation |
| Partial from-zero brief is rejected | `guided-paths/from-zero.ts` | Persist valid partial answers and derive the next question |
| Existing-creative selection writes campaign before review | `guided-paths/existing-creative.ts` | Move writes to confirmed action execution |
| Diagnosis UI only acknowledges; it cannot correct premises | `CreativeDiagnosisPanel.tsx` | Add typed edits and uncertainty-resolution transitions |
| Prompt augments exist only at terminal confirmation steps | both guided path modules | Supply active question/review context on every guided chat turn |
| Generic intent classification runs after only basic path creation | `orchestrator.ts` | Add journey-first turn interpreter before generic intent |
| Telemetry has no correction/navigation vocabulary | `guided-flow-telemetry.ts` | Add bounded adaptive events without changing it into state storage |
| Action confirm does not bind to flow revision | confirm route and action validation | Add stale-snapshot rejection/supersession |

## Sources

- `.planning/PROJECT.md` - live v13.8 goal, target capabilities, and confirmation principle
- `app/src/lib/guided-flow/types.ts` - current path/status and initial-step contract
- `app/src/server/db/schema.ts` - current flow, telemetry, feedback, and one-flow-per-thread schema
- `app/src/server/repositories/guided-flow.ts` - current scope validation and unversioned slot merge behavior
- `app/src/server/assistant/orchestrator.ts` - current chat classification/model/tool sequence
- `app/src/app/api/assistant/threads/[threadId]/guided-flow/route.ts` - current arbitrary upsert/patch boundary
- `app/src/server/assistant/guided-paths/from-zero.ts` and `app/src/server/ai/guided-briefing.ts` - briefing order, suggestions, mapping, and all-at-once persistence
- `app/src/server/assistant/guided-paths/existing-creative.ts` - diagnosis flow and pre-review campaign writes
- `app/src/server/assistant/action-contracts/*`, `tools/stubs/propose-action.ts`, and action confirm/execution routes - existing propose/confirm/execute boundary
- `app/src/server/assistant/guided-flow-telemetry*.ts` - strict metadata allowlist and best-effort lifecycle emission
- `app/src/components/assistant/AssistantChatCore.tsx` and guided panels - current fixed panel composition and thread-query integration

---
*Architecture research for: v13.8 Conversa Guiada Adaptativa*
*Researched: 2026-06-26*
