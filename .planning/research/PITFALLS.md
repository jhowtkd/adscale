# Pitfalls Research

**Domain:** Adaptive AI-guided creative workflows in an existing Next.js/React assistant
**Researched:** 2026-06-26
**Confidence:** HIGH for repository-specific risks; HIGH for state, retry, security, and accessibility patterns; MEDIUM for the proposed phase split because the v13.8 roadmap is not yet defined

## Scope and Existing Constraints

This research covers only the new adaptive conversational capabilities of v13.8. It assumes the existing `existing_creative` and `from_zero` paths, guided-flow persistence, action contracts/cards, client isolation, telemetry, and staging evidence remain in place.

The current implementation persists one mutable guided-flow snapshot per thread. The snapshot has a free-form `currentStep`, shallow-merged `slots`, no schema/version field, no revision for optimistic concurrency, and no transition history. UI panels render by matching path and step strings. Telemetry is intentionally best-effort and fire-and-forget. Those choices were adequate for fixed paths, but become the main failure surfaces when the model can infer answers, skip questions, revisit decisions, replace assets, or propose a different next step.

## Proposed Phase Frame (195+)

| Phase | Proposed responsibility |
|-------|-------------------------|
| **195 - Adaptive Journey State and Transition Contract** | Versioned state, typed events, legal transitions, revision checks, correction semantics, path switching, restart/resume, and derived completion rules. |
| **196 - Progressive From-Zero Conversation** | One-decision-at-a-time briefing, structured extraction, confidence/provenance, contextual suggestions, quick replies, and editable summary. |
| **197 - Collaborative Existing-Creative Diagnosis** | Distinguish observed facts from inferred assumptions, let users correct uncertain fields, and regenerate diagnosis/proposal without premature writes. |
| **198 - Inline Assets and Recovery** | Reference selection/upload/replacement, stale-result protection, retry/idempotency, partial failure recovery, and safe continuation. |
| **199 - Action Integration and Accessible UAT** | Revalidate action cards from current canonical state, preserve explicit confirmation, keyboard/screen-reader behavior, and model-based cross-path tests. |
| **200 - Staging Evidence and Release Gate** | Human staging matrix, concurrency/retry/injection evidence, telemetry reconciliation, sample honesty, and explicit blocker/tech-debt reporting. |

## Critical Pitfalls

### Pitfall 1: The model and persisted journey disagree about what is true

**What goes wrong:**
The assistant says the brief is ready while persisted `missingFields` still contains required fields, or the UI displays an earlier step after the model has moved on. A deploy can also make old `slots` incompatible with new transition logic. Two tabs can overwrite each other because both patch the same snapshot without a revision precondition.

**Why it happens:**
Conversation text, model-extracted fields, local React state, `currentStep`, `slots`, and action payloads become competing sources of truth. Today `currentStep` is an unconstrained string and `slots` is a generic JSON object; repository updates read and then write without optimistic concurrency. Snapshot persistence also becomes incompatible when state logic changes unless state/schema migration is explicit.

**How to avoid:**
- Make the persisted journey the canonical source of truth; messages are evidence and presentation, not state.
- Define typed domain events such as `answer_supplied`, `answer_corrected`, `step_back`, `path_switched`, `asset_replaced`, `proposal_accepted`, and `journey_restarted`.
- Use a deterministic transition reducer/state machine. The model may propose a typed event, but server code validates and applies it.
- Add `schemaVersion`, `revision`, and transition metadata. Update with compare-and-swap and return `409` plus fresh state on stale revisions.
- Define migrations or safe reset rules for persisted states from older journey versions.
- Derive `missingFields`, readiness, and available commands from canonical state rather than allowing each route/component to calculate them independently.

**Warning signs:**
- Refreshing changes the displayed question or readiness state.
- The transcript claims completion while the resume banner says the flow is blocked.
- Unknown step strings silently render no journey panel.
- Lost updates appear under two tabs or rapid answers.
- Deploying a new question order strands existing threads.

**Phase to address:**
Phase 195, verified again in Phases 199 and 200.

---

### Pitfall 2: Adaptive conversation accidentally performs writes or spends credits

**What goes wrong:**
A natural-language reply such as "pode melhorar" is treated as both clarification and approval. Recomputing a diagnosis creates a campaign, replacing a reference triggers generation, or auto-advancing a step confirms an old action card. The user cannot tell which input merely updates the brief and which input causes an external effect.

**Why it happens:**
Adaptive flows blur the boundary between interpretation, state transition, proposal, and execution. Model tool calls look convenient, so teams let the same handler update journey state, create domain records, and execute a paid action. Existing action-card confirmation can be bypassed indirectly if a new conversational endpoint calls write handlers directly.

**How to avoid:**
- Keep four explicit stages: interpret input, apply reversible journey event, propose effect, confirm/execute effect.
- Give the conversational engine read-only tools plus a bounded `propose_transition`/`propose_action`; deny direct campaign, credit, memory, export, and generation writes.
- Preserve action contracts and cards as the only gateway for cost/write operations.
- Revalidate scope, current revision, current inputs, credit estimate, and action fingerprint at confirmation time; invalidate stale cards after any relevant correction.
- Mark transitions as `pure` or `effectful` and test that back/edit/suggestion commands cannot reach effect handlers.

**Warning signs:**
- A chat route imports campaign creation or action execution directly.
- Tests assert that an action was proposed but not that zero writes occurred before confirmation.
- A card remains confirmable after the user changes CTA, asset, references, or path.
- Telemetry shows campaign/action IDs before a confirmation event.

**Phase to address:**
Phase 195 defines the boundary; Phases 196-198 obey it; Phase 199 proves it end to end.

---

### Pitfall 3: Correction and backtracking are cosmetic rather than semantic

**What goes wrong:**
The user edits the audience or replaces the base creative, but dependent assumptions, diagnosis, plan, missing fields, and action cards remain based on the old value. "Voltar" only changes the visible panel. Switching paths carries incompatible slots. Restart leaves stale error or campaign linkage behind.

**Why it happens:**
Fixed forms treat edits as field replacement. Adaptive journeys need dependency invalidation: changing an upstream fact can invalidate many derived facts and effects. The current shallow slot merge has no explicit delete/tombstone semantics, so removed data can survive a correction. Transcript history also tempts the model to keep using superseded answers.

**How to avoid:**
- Store field provenance and status: user-confirmed, model-inferred, derived, stale, or superseded.
- Define a dependency graph per path. A correction emits an event that updates the source field and invalidates all downstream derived artifacts deterministically.
- Implement explicit `unset`/replace semantics rather than relying only on shallow object merge.
- Keep an append-only transition/audit record or revisioned snapshots so backtracking is inspectable; do not erase the transcript to simulate undo.
- Define path-switch policies field by field: carry compatible confirmed facts, quarantine incompatible data, and require confirmation before reuse.
- Regenerate summaries and proposals from canonical current state, never from the full unfiltered transcript.

**Warning signs:**
- A corrected answer appears in the summary but not in the proposed action payload.
- `lastActionError`, old asset IDs, or old diagnosis fields reappear after "clear" or restart.
- Back then forward duplicates questions or actions.
- Path switching preserves hidden fields that are not shown for review.

**Phase to address:**
Phase 195 for semantics; Phase 196 for brief dependencies; Phase 197 for diagnosis assumptions; Phase 198 for asset replacement; Phase 199 for stale-card invalidation.

---

### Pitfall 4: Prompt injection turns creative content into journey control or leaks another client's data

**What goes wrong:**
Text extracted from an uploaded creative, reference metadata, a saved brand note, or a user answer contains instructions such as "ignore the workflow". The model treats that content as system policy, selects tools, exposes hidden context, or moves data across `clientProfileId` boundaries. A model-generated ID is trusted without server-side scope checks.

**Why it happens:**
Adaptive conversations ingest more untrusted text and use it to choose next steps. Prompt delimiters alone do not create a security boundary. The existing persistence denylist and repository scope checks are useful, but they do not make model interpretation authoritative or safe.

**How to avoid:**
- Treat all user, OCR, asset, reference, campaign, and retrieved-memory text as untrusted data, never instructions.
- Send the model the minimum allowlisted context for the active `(workspaceId, clientProfileId, threadId)` and label provenance explicitly.
- Require strict structured output for inferred fields, confidence, proposed next event, and citations to source IDs; reject unknown keys/events.
- Resolve all IDs server-side and re-check workspace/client/thread ownership on every read and mutation.
- Keep tool policy deny-by-default. The model cannot broaden context, choose arbitrary storage keys, or execute writes.
- Add adversarial fixtures in both paths, including instructions embedded in creative text and reference names, plus cross-client canary values that must never appear in output.

**Warning signs:**
- Raw OCR/reference text is concatenated into system/developer instructions.
- The model returns a `clientProfileId`, asset ID, or action type that the server accepts as authority.
- Logs/telemetry contain prompt payloads, signed URLs, tool arguments, or another client's canary.
- "Ignore previous instructions" changes available commands or confirmation policy.

**Phase to address:**
Phase 195 for event/tool constraints; Phases 196-198 for untrusted inputs; Phase 199 for adversarial tests; Phase 200 for staging evidence.

---

### Pitfall 5: Retries duplicate effects or late responses overwrite newer intent

**What goes wrong:**
Double-clicks, network retries, React revalidation, provider timeouts, or resumed async jobs create duplicate campaigns/actions/uploads. A slow diagnosis generated for revision 7 arrives after the user corrected the brief to revision 8 and overwrites the newer state. The UI reports failure even though the server completed the effect.

**Why it happens:**
Teams make the HTTP request retryable but not the domain command. They use random keys per retry, reuse a key with different parameters, or fail to bind async results to the source revision. Best-effort telemetry can then disagree with durable action state.

**How to avoid:**
- Assign every effectful command a server-validated idempotency key derived from thread, journey revision, command type, and stable payload fingerprint; never include sensitive data in the key.
- Persist command status and first result. Same key plus same fingerprint returns the original result; same key plus different payload is rejected.
- Bind model/provider/upload results to `sourceRevision` and relevant source IDs. Discard or quarantine stale completions.
- Separate retryable interpretation/read operations from effectful commands. Disable duplicate UI submission, but do not rely on the button state for correctness.
- Reconcile telemetry from durable command/action records so missing fire-and-forget events cannot invent abandonment or hide completion.

**Warning signs:**
- A retry produces a second action record or campaign.
- The only duplicate defense is a disabled button or in-memory boolean.
- Async callbacks patch the flow without checking revision/source asset.
- Telemetry has repeated confirmations or completion without a unique command/action identity.

**Phase to address:**
Phase 195 for revisions; Phase 198 for uploads/provider retries; Phase 199 for action execution; Phase 200 for reconciliation evidence.

---

### Pitfall 6: The journey declares completion from conversational confidence instead of executable readiness

**What goes wrong:**
The assistant produces a polished summary and marks the flow complete even though required facts are inferred, references are missing, an asset is still processing, a diagnosis is stale, or no current action card can be confirmed. Metrics improve because "completion" means the model said "pronto", not that the user reached a valid next action.

**Why it happens:**
LLM fluency is mistaken for state validity. Readiness is duplicated across prompts, panels, routes, and telemetry. Happy-path tests assert text and step labels rather than domain invariants and durable action state.

**How to avoid:**
- Define server-side readiness predicates per path and action. Completion is a derived state, not a model output.
- Separate `conversation_complete`, `brief_ready`, `diagnosis_reviewed`, `action_proposed`, `action_confirmed`, and `effect_succeeded` in state and telemetry.
- Require user confirmation for uncertain/inferred facts that affect factuality, cost, or downstream generation.
- Count a journey completion only when the milestone's chosen durable criterion is met; report proposal, confirmation, and successful execution separately.
- Add negative tests for missing fields, fewer than three valid references, stale/failed assets, stale cards, canceled actions, and provider fallback.

**Warning signs:**
- Completion is triggered by a model phrase, message count, or reaching the last visual panel.
- `status=completed` can coexist with `missingFields.length > 0` or unresolved asset jobs.
- Funnel completion rises while confirmed actions and successful effects remain flat.
- Tests never inspect persisted state after refresh.

**Phase to address:**
Phase 195 defines readiness; Phases 196 and 197 define path predicates; Phase 199 verifies action readiness; Phase 200 gates claims.

---

### Pitfall 7: Dynamic conversation is visually usable but inaccessible and disorienting

**What goes wrong:**
New questions, quick replies, summaries, errors, upload progress, and action cards appear without screen-reader announcements. Focus jumps on every assistant response, keyboard users cannot reach correction controls, and changing a selection unexpectedly advances or swaps the panel. Streaming text creates excessive live-region chatter.

**Why it happens:**
Adaptive UIs change DOM order and content more often than fixed forms. Teams optimize for visible chat behavior and assume existing `role="alert"` on errors covers the flow. Automated DOM tests do not exercise keyboard order, focus restoration, reduced motion, or assistive announcements.

**How to avoid:**
- Keep DOM and focus order aligned with conversational reading order; preserve composer focus during passive status updates.
- Announce concise state changes with appropriate `role="status"`/polite live regions; reserve alerts for actionable errors. Do not stream every token through an assertive live region.
- When a command intentionally changes context, move focus to the new question/summary heading and announce what changed; do not auto-advance merely from changing an input unless warned.
- Use real buttons/radios/checkboxes for quick replies and selections, with visible labels, selected state, error association, and full keyboard operation.
- Test both paths at desktop/mobile widths with keyboard-only operation and a screen reader smoke; include back, edit, path switch, retry, asset replacement, and confirmation.

**Warning signs:**
- Focus resets to the page body after an answer or retry.
- Quick replies are clickable `div`s or selection immediately changes context without warning.
- Screen readers announce every streamed token or announce nothing after upload/action completion.
- Mobile layout visually reorders controls differently from DOM order.

**Phase to address:**
Phases 196-198 implement accessible interactions; Phase 199 owns the complete accessibility UAT matrix; Phase 200 requires recorded staging evidence.

---

### Pitfall 8: Staging evidence proves only the scripted happy path

**What goes wrong:**
Automated tests pass with mocked model output and a single browser walk shows the two paths can finish, but no evidence covers corrections, stale tabs, injection, retries, provider failure, reload/resume, accessibility, or action confirmation after edits. The milestone is marked shipped while human staging evidence remains empty or the operational sample is still insufficient.

**Why it happens:**
Adaptive behavior has a combinatorial path space, so teams choose screenshots of the easiest route. Existing telemetry is treated as proof even though it is best-effort, and implementation status is collapsed with staging verdict and sample sufficiency.

**How to avoid:**
- Generate model-based transition tests from the Phase 195 state graph, including illegal transitions and invariant checks after every event.
- Maintain deterministic provider fixtures for ambiguity, correction, injection, timeout, duplicate delivery, and out-of-order completion.
- Run authenticated Playwright scenarios for both paths: happy path, edit/back, switch/restart, reload/resume, upload replacement, failed/retried action, stale card, and multi-tab conflict.
- Record staging evidence against real provider/upload/action infrastructure for both paths, with revision/action IDs and safe notes, never raw prompts or signed URLs.
- Keep four independent release statuses: implementation, automated verification, staging evidence, and operational sample/quality. Missing human walks or zero starts remain explicit blockers/tech debt.
- Reconcile funnel events against durable flow/action records before making completion or quality claims.

**Warning signs:**
- Evidence contains only fixture tests or screenshots.
- `evaluatedItemCount=0`, zero observed starts, or empty staging records are summarized as green.
- No test issues two requests from the same revision or delivers responses out of order.
- A completed browser test never confirms a current action card after a correction.

**Phase to address:**
Phase 199 builds the automated matrix; Phase 200 owns live staging evidence and release truth.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Let the model choose arbitrary step strings | Fast conversational prototype | Unrenderable states, impossible migration, prompt-dependent control flow | Never beyond a throwaway spike |
| Keep all adaptive data in generic `slots` | Avoid schema/migration work | No versioning, provenance, invalidation, or reliable deletion | Only for non-authoritative display hints |
| Recompute state from transcript on every turn | Minimal persistence changes | Non-determinism, injection exposure, token growth, superseded facts returning | Never for canonical journey state |
| Implement "back" as `currentStep = previous` | Easy UI demo | Derived state/action payloads remain stale | Never |
| Treat disabled buttons as idempotency | Simple UX | Duplicate writes under retries/concurrency | Never |
| Reuse existing completion event unchanged | No analytics migration | False funnel improvement and incomparable cohorts | Only if semantics are explicitly unchanged and proven |
| Record only successful transitions | Cleaner event stream | No diagnosis of illegal transitions, retries, or correction loops | Never for operational evidence |
| Defer keyboard/screen-reader checks to final QA | Faster feature coding | Interaction architecture may require expensive rewrite | Never; component checks start in each path phase |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Model adapter | Parse free-form prose to decide transitions | Strict structured proposal; server validates event, scope, revision, and legal transition |
| Guided-flow repository | Read-modify-write without revision | Compare-and-swap on `revision`; explicit conflict response and reload |
| Action cards | Snapshot payload remains valid after edits | Fingerprint relevant canonical state and invalidate/re-propose on change |
| Upload/OCR/diagnosis | Late result patches latest state | Bind result to source revision and asset ID; reject stale completion |
| Campaign creation | Create during briefing/diagnosis convenience step | Keep reversible journey updates separate; create only through confirmed action contract |
| Telemetry | Fire-and-forget events treated as ledger | Keep telemetry observational; reconcile with durable flow/action records |
| Resume banner/UI routing | Unknown step silently hides controls | Exhaustive typed renderer with explicit unsupported-version recovery |
| Persisted old journeys | Deploy new machine against old snapshot | Version state and provide migration, compatibility handler, or safe restart |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Send full transcript and all brand/reference data every turn | Rising latency/cost; old answers reappear | Build bounded context from canonical state and only relevant recent evidence | Long threads, large OCR/reference sets |
| Invoke the model for deterministic commands | "Voltar", "editar CTA", and quick replies feel slow or fail with provider | Handle known commands/events locally; use model only for interpretation/suggestion | Immediately under provider latency/failure |
| Regenerate full diagnosis/plan after every keystroke | Provider bursts, race conditions, stale overwrites | Debounce explicit submit; cancel or revision-bind requests | Rapid editing and mobile networks |
| Persist full snapshots plus unbounded event payloads | DB growth and privacy burden | Small typed events, bounded safe metadata, periodic snapshots/checkpoints | Long-lived high-edit threads |
| Announce every streaming token | Screen-reader overload and UI churn | Buffer output and announce meaningful status/completion | Any streamed response with assistive tech |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treat OCR/reference/campaign text as trusted instructions | Prompt injection controls journey or tool proposals | Untrusted-data boundary, structured outputs, deny-by-default tools, adversarial fixtures |
| Trust model-supplied IDs or scope | Cross-client/workspace disclosure or mutation | Resolve and authorize IDs server-side for every operation |
| Put prompt text, signed URLs, raw tool args, or user PII in telemetry/idempotency keys | Secret/data exposure through logs and evidence | Preserve current allowlists/denylists; use opaque IDs and fingerprints |
| Allow a correction message to imply confirmation | Unauthorized spend/write | Explicit action card confirmation with current revision/fingerprint |
| Build model context from global memory search without hard client filter | Brand data leakage | Filter by workspace and `clientProfileId` before retrieval; cross-client canary tests |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Ask everything again after one correction | Conversation feels punitive | Invalidate only dependent facts and explain what must be reconfirmed |
| Hide inferred assumptions inside polished prose | User approves false premises | Show observed, inferred, and uncertain fields separately with inline edit |
| Auto-skip questions without showing why | User loses control and cannot audit readiness | Show concise summary of reused confirmed context and offer edit |
| "Back" changes the screen but not the state | Later output contradicts correction | Event-based back/edit with deterministic invalidation |
| Generic retry after partial failure | User repeats work or creates duplicates | Show what succeeded, what failed, and one idempotent retry command |
| Path switch silently discards or carries data | Surprise data loss or contamination | Preview retained/reset fields and require explicit switch |
| Completion copy before executable readiness | False confidence | Tie copy to server readiness and current confirmable action |
| Too many live announcements | Cognitive and screen-reader overload | Concise status updates, predictable focus, user-controlled detail |

## "Looks Done But Isn't" Checklist

- [ ] **Adaptive engine:** Model can vary question order, but every resulting transition is typed, legal, revision-checked, and replayable.
- [ ] **Resume:** Reload resumes the exact canonical decision state, not merely the last transcript message.
- [ ] **Back/edit:** Correcting an upstream answer invalidates all dependent diagnosis, plan, readiness, and action payloads.
- [ ] **Path switch/restart:** Retained and cleared fields are explicit; stale slots/errors/assets do not survive accidentally.
- [ ] **Suggestions:** Quick replies remain suggestions; selecting one does not perform cost/write effects.
- [ ] **Security:** Injection fixtures in user text, creative text, OCR, filenames, and references cannot alter tool policy or scope.
- [ ] **Isolation:** Cross-client canary data never enters model context, output, logs, telemetry, or action payloads.
- [ ] **Retries:** Duplicate requests and provider redelivery return one durable result; stale async responses cannot overwrite newer revisions.
- [ ] **Completion:** `completed` is impossible while required fields/assets/references/readiness invariants fail.
- [ ] **Action cards:** Any relevant edit invalidates the old card; confirmation revalidates current state and scope.
- [ ] **Accessibility:** Both paths work keyboard-only, preserve meaningful focus order, and announce errors/progress/results without token-level chatter.
- [ ] **Telemetry:** Correction, backtrack, retry, conflict, stale result, and completion semantics are queryable with safe metadata.
- [ ] **Staging:** Both real-provider paths include correction and failure recovery, not only straight-line completion.
- [ ] **Release truth:** Implementation, automated tests, staging evidence, and operational sample sufficiency remain separate statuses.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| State/model drift | HIGH | Freeze new transitions, add version/revision, migrate valid snapshots, safely restart incompatible flows, rebuild derived readiness |
| Accidental pre-confirmation effect | HIGH | Disable route/tool path, audit action/credit records, deduplicate or compensate effects, invalidate affected cards, add zero-write regression tests |
| Broken correction/backtracking | MEDIUM | Add provenance/dependency map, mark derived data stale, rebuild summaries/cards, provide explicit user reconfirmation |
| Prompt injection or isolation breach | HIGH | Revoke affected context/tool access, inspect logs/evidence, rotate exposed secrets/URLs, patch retrieval/scope checks, add canary regression suite |
| Duplicate or stale async effect | HIGH | Identify command fingerprints, reconcile durable records, compensate duplicates, ignore stale results, backfill idempotency status |
| False completion metrics | MEDIUM | Redefine events, recompute from durable records where possible, annotate historical cohorts, block claims until fresh sample |
| Accessibility regression | MEDIUM | Stabilize DOM/focus contract, add live-region policy, fix semantic controls, rerun keyboard/screen-reader staging matrix |
| Inadequate staging evidence | LOW-MEDIUM | Mark gate incomplete, execute required matrix, store structured safe evidence, keep accepted debt explicit |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| State/model drift and concurrency | Phase 195 | Transition-table tests, schema migration fixtures, two-tab revision conflict, refresh/resume parity |
| Accidental side effects | Phases 195 and 199 | Zero writes before confirmation; stale card rejection; effect only through action executor |
| Correction/backtracking/path switch | Phases 195-198 | Dependency invalidation tests and browser journeys for edit/back/switch/restart |
| Prompt injection and data isolation | Phases 195-199 | Structured-output rejection, embedded-instruction fixtures, two-client canary tests |
| Retries/idempotency/stale responses | Phases 198 and 199 | Duplicate delivery, same-key/different-payload rejection, out-of-order response tests |
| False completion | Phases 195-197 and 200 | Server invariant tests; funnel reconciliation; claims blocked without durable readiness/evidence |
| Accessibility | Phase 199, implemented during 196-198 | Keyboard, focus-order, status-announcement, mobile, and screen-reader staging checks |
| Thin staging evidence | Phase 200 | Structured evidence for both paths plus correction, retry, injection, reload, and live action lifecycle |

## Sources

### Repository evidence

- `.planning/PROJECT.md` - v13.8 goal, target features, guiding principle, and inherited staging debt.
- `app/src/lib/guided-flow/types.ts` - current paths/statuses and string-based initial steps.
- `app/src/server/repositories/guided-flow.ts` - single snapshot, generic slots, shallow merge, scope checks, and read-modify-write behavior.
- `app/drizzle/0058_assistant_guided_flow.sql` - one flow per thread with no schema version or revision column.
- `app/src/components/assistant/AssistantChatCore.tsx` - panel selection coupled to path/current-step string comparisons.
- `app/src/server/assistant/guided-flow-telemetry.ts` - safe metadata allowlist and best-effort fire-and-forget telemetry.
- `app/src/server/assistant/guided-paths/action-integration.ts` - current blocked/resume slot behavior and the need for explicit deletion semantics.
- `.planning/phases/194-operational-release-gate/194-EVIDENCE.json` - inherited missing human staging evidence and sample caveats.

### Primary references

- [OpenAI: Safety in building agents](https://platform.openai.com/docs/guides/agent-builder-safety) - untrusted input, prompt injection, structured outputs, and tool approval boundaries.
- [OpenAI: Structured model outputs](https://platform.openai.com/docs/guides/structured-outputs) - schema-constrained model output and function calling.
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) - stable idempotency keys, parameter comparison, and safe retry semantics.
- [Stately: Persistence](https://stately.ai/docs/persistence) - persisted snapshots, incompatible state after logic changes, serialization, and event replay tradeoffs.
- [Stately: Testing](https://stately.ai/docs/testing) - transition/effect testing and model-based graph coverage.
- [W3C WCAG 2.2: Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) - meaningful keyboard and DOM focus order.
- [W3C WCAG 2.2: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) - programmatic announcements for progress, results, and errors without unnecessary focus changes.
- [W3C WCAG 2.2: On Input](https://www.w3.org/WAI/WCAG22/Understanding/on-input.html) - predictable behavior and warning before input causes context changes.
- [W3C WCAG 2.2: Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) - identifying and describing input errors.

---
*Pitfalls research for: ADScale v13.8 Conversa Guiada Adaptativa*
*Researched: 2026-06-26*
