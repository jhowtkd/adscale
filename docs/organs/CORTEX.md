# Cortex — Organ Deep Dive

> Character-level map of the ADScale conversational head.  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Version: **v0.1** · 2026-07-10

---

## 1. What Cortex is

Cortex turns **human language** into **confirmed, typed actions** that wake Hands, Memory, Taste, and campaign APIs. It does not generate images (Hands) or judge art (Gaze).

| Layer | Path |
|-------|------|
| Brainstem (turn loop) | `app/src/server/assistant/orchestrator.ts` |
| Agent prefrontal | `app/src/server/assistant/goal/` |
| HTTP face | `app/src/app/api/assistant/` |
| UI face | `app/src/components/assistant/` |
| Client contracts | `app/src/lib/assistant/`, `app/src/lib/guided-flow/` |

---

## 2. Two consciousness modes

Chat entry: `POST .../threads/[threadId]/chat`

```text
getGoalRunByThread(threadId)
  if goalRun exists AND stage ∉ {completed, stopped}
    → runGoalAgentTurn()     # agent / multi-step tool loop
  else
    → runAssistantTurn()     # classic / single-pass + guided
```

| Mode | Who | Loop | Gate |
|------|-----|------|------|
| **Classic** | everyone | `runAssistantTurn` — one model pass + guided state machine | default |
| **Agent** | owners + tester workspaces | `runGoalAgentTurn` — bounded MiniMax steps with tool results fed back | `goal/pilot.ts` → `resolveAssistantExperience` |

Agent hard cap: `GOAL_AGENT_MAX_STEPS` in `goal/system-prompt.ts`.

---

## 3. One classic thought (`runAssistantTurn`)

File: `orchestrator.ts`

```text
1. Scope check (thread ↔ clientProfile)
2. Persist user message (+ attachments payload)
3. buildAssistantContext()          # sensory cortex
4. Guided path bootstrap
     · no flow / unclassified → classifyGuidedPath()
     · clarify → reply & stop
     · classified → select_path command
5. Active guided flow shortcuts
     · back / restart / switch_path / answer_brief (from_zero)
     · applyGuidedConversationCommand → short ack & stop
6. If thread has campaignId
     · classifyCreativeRevisionIntent (plan vs creative)
     · handlePlanRevisionMessage / handleCreativeRevisionMessage
     · may yield action_card & stop
7. classifyUserIntent()
     · clarify quick vs complete campaign → stop
8. MiniMax stream
     · systemPrompt + intent/attachment/path augments
     · tools from TOOL_REGISTRY
     · on tool_call → evaluateToolCall (policy)
     · may yield tool_summary + action_card (pending)
9. Sanitize assistant text (no denied keys, strip think blocks)
10. Persist assistant message → done
```

SSE events to the face: `text_delta` · `tool_summary` · `action_card` · `goal_state` (agent only) · `done` · `error`.

---

## 4. Lobes (directory map)

### 4.1 Stem — `orchestrator.ts`

Single-pass classic turn. Early exits for guided commands and plan/creative revision keep the model out of the loop when heuristics are enough.

### 4.2 Sensory cortex — `context/`

| File | Job |
|------|-----|
| `context-builder.ts` | Assemble allowlisted context: thread, client, campaign, brand kit, **Memory** block, recent messages (~20), goal context |
| `allowlist.ts` | Whitelist keys the model may see |
| `sanitize.ts` | Strip signed URLs / denied fields; `ContextScopeError` |

**Nerve out to body:** reads Memory (`getBrandMemoryContext`) — Cortex *sees* Memory; it does not own it.

### 4.3 Broca — guided journeys

| Path | Job |
|------|-----|
| `lib/guided-flow/commands.ts` | Shared Zod command envelope (client ↔ server) |
| `lib/guided-flow/types.ts` | Paths: `existing_creative` \| `from_zero` \| `unclassified` |
| `guided-conversation/service.ts` | `applyGuidedConversationCommand` — CAS revision, idempotent commandId |
| `guided-conversation/transition.ts` | Legal step transitions |
| `guided-conversation/presenter.ts` | What the UI should show for current step |
| `guided-paths/from-zero.ts` | Brief collection + prompt augment |
| `guided-paths/existing-creative.ts` | Select creative, diagnose, materialize campaign |
| `guided-paths/action-integration.ts` | After action executes, advance guided flow |

**from_zero** starts at `collect_brief` (min 3 references).  
**existing_creative** starts at `select_creative`.

Telemetry: `guided-flow-telemetry*.ts`, funnel summaries.

### 4.4 Motor cortex — actions

**Contracts** (`action-contracts/`): schema + risk + Energy impact + confirmation policy.

```text
ActionContract {
  actionType, intentFamily, label,
  inputSchema, required/optional fields,
  allowedRoles, riskLabel, creditImpact,
  confirmationPolicy, alwaysRiskCopy?
}
```

Registered in `contracts/index.ts` (13 action types):

| Family | Types |
|--------|-------|
| Quick | `quick_restyle`, `quick_format_adapt`, `quick_regenerate`, `quick_review`, `quick_save_reference`, `quick_package` |
| Campaign / creative | `start_complete_campaign`, `start_brand_training`, `create_creative_plan`, `revise_creative_plan`, `revise_creative`, `generate_creative_triplet`, `revise_creative_annotations`, `generate_goal_package` |

**Propose path:** model calls tool `propose_action` → `validateProposeAction` → `createAssistantAction` (status pending) → UI ActionCard → user confirms → `POST .../actions/[id]/confirm` → `executeConfirmedAssistantAction`.

**Execution** (`action-execution/execute.ts`): dispatch table `HANDLERS[actionType]` → side effects (Hands jobs, brand training, plans, etc.) → guided-flow transition + telemetry.

Almost all spendable actions use `confirmationPolicy: "required"` so **Energy** is not burned on a hallucinated tool call.

### 4.5 Working memory — iteration & versions

| Lobe | Path | Job |
|------|------|-----|
| Plan iteration | `plan-iteration/` | Feedback → propose plan revision → digest-bound action |
| Creative iteration | `creative-iteration/` | Feedback → revise creative / annotations |
| Artifact versions | `artifact-version/` | Immutable plan/creative versions, compare, promote |

Intent classifiers: `plan-iteration/intent.ts`, `creative-iteration/intent.ts` (and orchestrator branch when `campaignId` is set).

### 4.6 Prefrontal — goal agent

| File | Job |
|------|-----|
| `goal/pilot.ts` | Eligibility: platform owner email or tester entitlement |
| `goal/orchestrator-loop.ts` | Multi-step stream; tool results re-injected; step limit |
| `goal/system-prompt.ts` | Agent system prompt + max steps |
| `goal/service.ts` | Goal run lifecycle / context |
| `goal/finalize-derivation.ts` | Close goal when Hands finish (success/fail) |
| `goal/projection.ts` | Client-safe goal DTO (refetched on `goal_state` SSE) |
| `tools/update-goal-plan.ts` | Agent-only tool to mutate goal plan |

### 4.7 Tools — `tools/`

Only three registered tools today:

| Tool | Role |
|------|------|
| `get_thread_context` | Read sanitized thread context |
| `propose_action` | Create pending action card (main motor exit) |
| `update_goal_plan` | Goal-agent plan updates |

Policy: `tools/policy.ts` → `evaluateToolCall` (roles, confirmation, sanitization).

### 4.8 Brainstem LLM — `model/`

| File | Job |
|------|-----|
| `minimax-adapter.ts` / `minimax-client.ts` | OpenAI-compatible MiniMax stream |
| `client.ts` | Model client interface |
| `reasoning-sanitizer.ts` | Strip think blocks; assert no raw reasoning in persisted text |

### 4.9 Stream — `stream/sse.ts`

Canonical SSE event names for the chat route encoder.

---

## 5. HTTP nerves (API surface)

Under `app/src/app/api/assistant/`:

| Area | Routes (representative) |
|------|-------------------------|
| Threads | `threads/`, `threads/[id]/`, messages, link-campaign |
| Chat | `threads/[id]/chat` (SSE) |
| Guided | `guided-flow/`, commands, from-zero, select-creative, feedback |
| Actions | `actions/[id]/confirm`, `cancel` |
| Iteration | plan-revisions, creative-revisions, artifact-versions (list/compare/promote) |
| Goal | `goal/`, select-base, annotations, corpus-consent |
| Proposals | `artifact-proposals/[id]/cancel` |

Auth: `requireWorkspaceAccess` + role checks. Chat is rate-limited (`category: "ai"`).

---

## 6. Face (UI)

`app/src/components/assistant/` — shell, message list, action cards, guided journey cards, goal workspace, review/version panels, campaign drawer.

Client helpers: `app/src/lib/assistant/` (SSE parse, display contract, attachments, goal helpers).

---

## 7. Nerves to the rest of the body

| Direction | Organ | How |
|-----------|-------|-----|
| Out | **Hands** | Handlers enqueue derivation / restyle / triplet / regen jobs |
| Out | **Memory / Taste** | `start_brand_training` and approval-side events |
| Out | **Contract** | `create_creative_plan` / revise plan |
| Out | **Energy** | `creditImpact` on contracts; spend at confirm/API boundary |
| In | **Memory** | Context builder pulls brand memory block |
| In | **Hands** | Job sync / `finalizeGoalDerivation` closes agent actions |
| Later | **Gaze ⟂ Skin** | Only after Hands produce a derivation |

---

## 8. Safety invariants

1. **Confirm before spend** — propose ≠ execute.  
2. **Allowlist + sanitize** — model never sees arbitrary DB rows or signed secrets in persisted payloads.  
3. **Guided CAS** — `expectedRevision` + commandId idempotency.  
4. **Action digest** — guided actions bind flow revision + input snapshot.  
5. **Agent step cap** — no unbounded tool loops.  
6. **SSE errors are generic** — real errors stay server-side / Sentry.  
7. **Scope** — thread must match `clientProfileId` / workspace on every turn.

---

## 9. What Cortex is not

- Not Gaze (no `olharVerdict`)  
- Not Hands (no `image-generation`)  
- Not Marrow (no corpus owner queue)  
- Not the classic campaign wizard outside chat  
- Not Energy accounting (only declares impact; billing module spends)

---

## 10. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `orchestrator.ts` | Classic turn spine |
| 2 | `action-execution/execute.ts` | Motor dispatch |
| 3 | `action-contracts/contracts/index.ts` | Full action vocabulary |
| 4 | `context/context-builder.ts` | What the model may know |
| 5 | `guided-conversation/service.ts` | Journey state machine |
| 6 | `goal/orchestrator-loop.ts` | Agent consciousness |
| 7 | `api/.../chat/route.ts` | Mode switch + SSE |
| 8 | `tools/stubs/propose-action.ts` | How thoughts become pending actions |

---

## 11. Maintenance

When adding a Cortex capability:

1. New **side effect** → new `ActionContract` + handler (not a raw tool that mutates).  
2. New **journey step** → `lib/guided-flow` command + transition + presenter.  
3. New **model capability** → tool in registry + policy; prefer propose_action over silent writes.  
4. Update this deep dive + [`COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) organ card if the public shape of Cortex changes.
