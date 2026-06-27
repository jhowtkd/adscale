# Feature Research

**Domain:** Adaptive guided creative-assistant journeys in an AI creative SaaS (ADScale v13.8)
**Researched:** 2026-06-26
**Confidence:** HIGH for interaction patterns and repository baseline; MEDIUM for the exact branching policy until staging behavior is observed

## Scope and Baseline

This research covers only the new adaptive conversational layer for the existing `/assistant` journeys. It does not re-scope thread persistence, multi-client isolation, action contracts, action cards, credit confirmation, or operational telemetry already delivered in v13.5-v13.7.

The live implementation already provides:

- one persisted `assistant_guided_flows` record per thread with `path`, `status`, `currentStep`, `slots`, missing fields, assets, references, and campaign linkage;
- two paths: `existing_creative` and `from_zero`;
- fixed transitions for creative selection/diagnosis and brief/reference collection;
- confirmable action cards for writes and credit-bearing work;
- lifecycle telemetry and a path/step funnel;
- a progressive briefing implementation outside `/assistant` with one field group at a time, suggestions, edit, skip, and persistence.

The current `/assistant` gap is not another chat model. It is a controlled conversational journey that can vary the next question from known state, accept corrections at any point, and recover without discarding valid work. Adaptivity should remain bounded by an explicit journey graph and typed slot contracts; model output may suggest values or classify an answer, but must not become the source of truth for state transitions or side effects.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these capabilities makes an “adaptive conversation” feel like a form with chat styling.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **One decision per turn** | Progressive-disclosure and conversation guidance consistently reduce cognitive load by asking one focused question at a time | MEDIUM | Replace the eight-field `FromZeroBriefPanel` with a turn renderer. Group product + offer only when the relationship is necessary to answer coherently. |
| **State-aware next question** | Users expect the assistant not to ask for information already known from the client profile, campaign, asset analysis, or earlier answers | HIGH | Use deterministic eligibility/requiredness rules over typed slots. Skip satisfied steps and branch only on material gaps or uncertainty. |
| **Visible understanding with lightweight correction** | A conversational assistant must show what it understood so a wrong inference is caught immediately | MEDIUM | Implicitly confirm low-risk parameters in the next prompt; provide `Corrigir` beside inferred or transformed values. Avoid a yes/no confirmation after every answer. |
| **Back and edit without replaying the journey** | Established question-flow patterns let users revisit completed answers with values preserved | HIGH | Editing from the summary should return directly to the summary after any newly required dependent question, not force traversal through all later steps. |
| **Editable review before commitment** | Users need one coherent view of the brief/diagnosis and proposed result before a campaign write or credit-bearing action | MEDIUM | Reuse action cards for final execution; add a journey summary with per-section `Editar` controls before the action card is proposed. |
| **Explicit optional/unknown handling** | Users do not always know audience, objection, constraint, or platform yet | MEDIUM | Support `Não sei`, `Sugerir para mim`, and `Pular` only where the field contract allows it. Persist unknown separately from unanswered so the assistant does not loop. |
| **Quick replies plus free text** | Suggested choices accelerate common answers, while free text prevents the journey from becoming a rigid wizard | MEDIUM | Quick replies are contextual accelerators, never the only valid input unless the domain is genuinely closed (for example, path choice). |
| **Resume with exact context** | A persisted guided journey should reopen at the unresolved decision, with prior answers and assets intact | MEDIUM | Extend the existing resume banner to summarize the last confirmed decision and the next required one. Do not reconstruct state from transcript text. |
| **Switch path and restart controls** | A user who selected the wrong starting path must be able to recover without opening a new thread | HIGH | `Trocar caminho` preserves compatible slots only after showing what will be retained/discarded. `Reiniciar` is explicit and reversible until confirmed. |
| **Inline asset/reference add, replace, remove, retry** | Asset-dependent journeys cannot send users away to repair the current step | HIGH | Selection, upload, replacement, and upload/analysis failure recovery belong in the active turn. Preserve successful items when one item fails. |
| **Context-specific recovery** | Repeating the same failed prompt or generic “try again” does not help users progress | MEDIUM | First repair: concise rephrase. Second repair: narrower options/example. System failure: retain state and offer retry, replace, or continue only when safe. |
| **Adaptive progress orientation** | Users need orientation, but a fixed “step 3 of 8” becomes false when the route branches | LOW | Show stable phases (`Briefing`, `Referências`, `Plano`) and completed/current state. Use numeric counts only inside a currently known fixed set. |
| **Accessible interaction feedback** | Dynamic turns, validation, uploads, and errors must remain understandable by keyboard and assistive technology | MEDIUM | Move focus to the new turn/error, associate errors with controls, announce async completion, and retain valid input after errors. |

### Differentiators (Competitive Advantage)

These capabilities fit ADScale's core value better than a generic conversational wrapper.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Creative-readiness routing** | The journey asks only what is needed to produce a generation-ready creative decision, not to complete every possible campaign field | HIGH | Requiredness depends on action contract, path, existing evidence, and confidence. Missing data unrelated to the next useful action stays deferred. |
| **Uncertainty-led diagnosis repair** | In `Já tenho peça`, the system explicitly invites correction of low-confidence offer, audience, CTA, or objective before proposing improvement | HIGH | Rank `missingFields` and low-confidence slots; ask the highest-impact uncertainty first and update both diagnosis context and campaign draft coherently. |
| **Suggestion with provenance** | A suggested answer is more trustworthy when users know whether it came from brand profile, selected creative, previous campaign, or assistant inference | MEDIUM | Use compact source labels such as `Da peça`, `Da marca`, or `Sugestão`. Do not expose model internals or confidence decimals. |
| **Dependency-aware correction** | Changing the offer can reopen promise/CTA review without invalidating unrelated references or brand constraints | HIGH | Define slot dependencies and stale-derived markers. Never silently overwrite downstream answers; mark affected values for review. |
| **Result-oriented action cards** | The final choice describes the outcome and preserved constraints, not an internal action-contract name | LOW | Keep the existing execution/credit contract, but frame choices as `Criar plano para estas referências` or `Gerar variações preservando X`. |
| **Dual-mode acceleration** | Most users follow the guided turn, while experienced operators can open an editable summary and change several fields directly | MEDIUM | Reuse the existing full-fields disclosure pattern as an escape hatch. The guided route remains primary; bulk editing is not a separate source of truth. |
| **Journey-quality telemetry for repair** | ADScale can distinguish normal progression from confusion, correction, path switching, upload recovery, and repeated repair | MEDIUM | Extend the existing event vocabulary rather than creating a second analytics stream. Measure whether repair leads to progress, not just event volume. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Open-ended autonomous agent controls the journey** | Feels maximally conversational | Non-deterministic transitions, weak resumability, difficult testing, and side-effect risk | Explicit journey graph + typed slots; model limited to extraction, suggestions, and wording |
| **LLM decides every next question** | Appears more adaptive | Adds latency/cost and can ask irrelevant or repeated questions | Deterministic next-step policy with model-assisted content only where ambiguity exists |
| **Transcript as canonical state** | Avoids extending structured persistence | Corrections, retries, and resume become fragile; old answers remain ambiguous | Persist canonical answers, source, confirmation state, and dependency status in guided-flow slots |
| **Confirm every answer explicitly** | Seems safer | Creates confirmation fatigue and makes the conversation robotic | Implicit confirmation for low-risk facts; explicit confirmation only for ambiguity, writing, cost, or hard-to-reverse actions |
| **Fixed percentage or fixed step count across a branching flow** | Familiar progress UI | Becomes inaccurate when questions are skipped or reopened | Stable phase indicator plus current decision and completed sections |
| **Silent inference and auto-fill** | Reduces visible work | Users cannot detect wrong assumptions before they contaminate creative direction | Show suggested/inferred values with source and one-step correction |
| **Restart after any correction or failed upload** | Simplifies implementation | Punishes users and discards trustworthy context | Patch the affected slot/asset, preserve valid state, recompute only dependent steps |
| **Execute immediately after the final answer** | Removes a click | Violates the existing confirmation principle for writes and credits | Editable summary, then an explicit outcome-oriented action card |
| **Unlimited quick-reply menus** | Makes every state look guided | Overwhelms users and hides valid free-form answers | Two to four high-value choices, `Outro`, and free text |
| **Mandatory conversational small talk or persona theatrics** | Makes the assistant feel human | Increases turn count and obscures the creative decision | Brief acknowledgements that carry context forward |
| **Generic workflow-builder framework in v13.8** | Promises reuse for future journeys | Expands scope before the two known journeys prove the interaction contract | Build a small typed engine for these two paths, extracting only demonstrated shared primitives |
| **New recommendation/quality intelligence** | “Adaptive” can imply smarter creative strategy | Mixes journey UX with a separate model-quality milestone | Reuse existing diagnosis, brand context, and suggestion logic; improve how decisions are collected and corrected |

## Established Pattern Comparison

This comparison uses documented interaction behavior, not vendor feature claims.

| Pattern | Proven Behavior | Limitation for ADScale | v13.8 Adaptation |
|---------|-----------------|------------------------|------------------|
| **GOV.UK question pages** | One focused question, a reliable back action, preserved answers, and “I do not know” when valid | Page-by-page navigation can feel heavy inside chat | One active decision turn with back/edit controls and persisted answers |
| **GOV.UK check answers** | Review before submission; change a section and return directly to review; ask new dependent questions only when needed | Assumes mostly deterministic forms | Use an editable brief/diagnosis summary and dependency-aware revalidation before returning |
| **Google conversation confirmations/corrections** | Implicit confirmation for common parameters, explicit confirmation for costly/irreversible actions, one-step correction | Written chat can support richer controls than voice | Pair concise acknowledgement with `Corrigir`; reserve action card confirmation for write/cost |
| **Google conversational repair** | Context-specific reprompt, escalating help, alternatives after repeated failure | Voice “no input” mechanics do not directly apply | Track no-match/system-repair attempts per decision; narrow choices without discarding typed input |
| **W3C multi-page forms** | Logical groups, progress orientation, optional-step clarity, revisiting completed steps with data saved | Fixed step indicators can misrepresent branching | Stable phase progress, accessible async announcements, retained input and linked errors |
| **Existing ADScale guided briefing** | Suggestions, accept/edit/skip, one field group at a time, campaign persistence | Local component state, linear order, no path switching or dependency-aware review | Reuse the domain mapping and interaction vocabulary inside persisted `/assistant` journey state |

## Feature Dependencies

```text
Typed journey definition (paths, states, allowed transitions)
    |--requires--> canonical persisted slot state
    |                 |--requires--> answer value + source + confirmation/unknown status
    |                 `--requires--> asset/reference lifecycle state
    |--enables----> deterministic next-decision policy
    |                 |--enables--> skipped satisfied questions
    |                 `--enables--> uncertainty-led clarification
    `--enables----> validated back/edit/switch/restart operations

Contextual suggestions
    |--requires--> canonical slots + client/campaign/asset context
    `--enhances--> quick replies and implicit confirmation

Dependency-aware correction
    |--requires--> slot dependency map
    `--enables----> accurate editable summary
                         `--precedes--> action-card proposal
                                            `--precedes--> existing confirmation/execution pipeline

Inline upload/replace/retry
    |--requires--> asset/reference lifecycle state
    `--enhances--> both guided paths

Adaptive telemetry
    |--requires--> stable transition/repair event semantics
    `--enhances--> existing guided-flow funnel and staging UAT

Open-ended agent state control --conflicts--> deterministic resume, auditability, and safe confirmation
Fixed step count              --conflicts--> branching and dependency-aware correction
```

### Dependency Notes

- **The journey engine requires canonical slot metadata, not only values.** Adaptivity needs to distinguish user-provided, inferred, suggested, explicitly unknown, confirmed, and stale-derived values.
- **Back/edit/switch/restart require transition commands.** Directly patching arbitrary `currentStep` strings cannot enforce valid navigation or define what is preserved.
- **Correction requires dependencies.** Offer may affect promise and CTA; selected creative affects diagnosis; replacing references affects the proposed plan. Unrelated confirmed values should remain untouched.
- **The summary must precede the action proposal.** Existing action cards protect execution, but they cannot correct an incomplete or misunderstood brief by themselves.
- **Inline asset recovery depends on per-item status.** The current arrays of IDs represent success only; upload, analysis, failure, replacement, and retry need explicit UI/domain state even if only completed IDs remain durable assets.
- **Telemetry depends on stable semantics.** Add transition reasons and events such as `guided_answer_corrected`, `guided_path_switched`, and `guided_repair_succeeded`; never put raw answer text, prompts, or signed URLs in metadata.

## MVP Definition

### Launch With (v13.8)

Minimum viable milestone: both existing journeys become progressive, correctable, resumable conversations while retaining the current safe action boundary.

- [ ] **Typed journey states and commands for both paths** — support answer, back, edit, switch path, restart, resume, retry, and complete through validated transitions.
- [ ] **Canonical adaptive slot state** — persist answer, origin, confidence band where relevant, confirmation/unknown status, and stale-derived dependencies without relying on transcript parsing.
- [ ] **`Produzir do zero` progressive briefing** — one decision per turn, contextual suggestion, two-to-four quick replies where useful, free text, valid skip/unknown handling, and stable phase progress.
- [ ] **Editable from-zero summary** — review product/offer, audience, promise, CTA, platforms, constraints, and selected references; edit a section and return to review after dependent questions.
- [ ] **Collaborative `Já tenho peça` diagnosis** — expose assumptions and uncertain brief fields, collect corrections before improvement proposal, and preserve high-confidence extracted facts.
- [ ] **Inline creative/reference lifecycle** — select or upload, add/remove/replace, retain successful assets, and recover from upload/analysis failure in the active turn.
- [ ] **Outcome-oriented action proposal** — show exactly what will be created/changed and the preserved constraints before the existing confirmation/credit workflow.
- [ ] **Resume and path-change UX** — resume at the unresolved decision; explain retained/discarded context before switching or restarting.
- [ ] **Adaptive repair and accessibility** — contextual error recovery, preserved input, focus/live-region behavior, keyboard operation, and no dead-end state.
- [ ] **Telemetry extension and staging UAT** — cover corrections, navigation, switch/restart, upload recovery, summary edits, and final action handoff across both paths without logging sensitive content.

### Add After Validation (v13.8.x)

- [ ] **Telemetry-tuned branch ordering** — change question priority only after real step/repair evidence identifies friction.
- [ ] **Cross-thread answer reuse with explicit consent** — offer a prior campaign answer when users repeatedly enter the same value for a client.
- [ ] **Richer suggestion provenance detail** — add source drill-down only if users distrust or frequently correct suggestions.
- [ ] **Bulk-edit power mode refinements** — improve multi-field editing if experienced users consistently abandon the one-turn route.
- [ ] **Alternative reference recommendations** — suggest existing client references when inline selection repeatedly stalls, without changing the minimum-reference policy silently.

### Future Consideration (v14+)

- [ ] **New guided journey types** — wait until the two current paths validate the shared engine primitives.
- [ ] **Natural-language global commands across arbitrary screens** — broader assistant orchestration is outside this journey milestone.
- [ ] **Model-learned dynamic question policy** — requires sufficient real journey outcomes and a safe offline evaluation contract.
- [ ] **Multi-user collaborative journey editing** — conflict resolution and presence are not needed to validate individual adaptive journeys.
- [ ] **Voice input/output** — different repair, latency, accessibility, and confirmation constraints.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Typed states + validated transition commands | HIGH | HIGH | P1 |
| Canonical slot metadata and dependency map | HIGH | HIGH | P1 |
| Progressive `from_zero` turns | HIGH | MEDIUM | P1 |
| Editable review summary | HIGH | MEDIUM | P1 |
| Diagnosis uncertainty correction | HIGH | HIGH | P1 |
| Back/edit/resume | HIGH | HIGH | P1 |
| Switch path/restart with retention preview | HIGH | MEDIUM | P1 |
| Inline asset/reference recovery | HIGH | HIGH | P1 |
| Outcome-oriented action cards | HIGH | LOW | P1 |
| Adaptive repair + accessible dynamic feedback | HIGH | MEDIUM | P1 |
| Adaptive telemetry + two-path staging UAT | HIGH | MEDIUM | P1 |
| Cross-thread answer reuse | MEDIUM | HIGH | P2 |
| Telemetry-tuned branch ordering | MEDIUM | MEDIUM | P2 |
| Model-learned question policy | LOW | HIGH | P3 |
| Generic journey builder | LOW | HIGH | P3 |

**Priority key:**

- **P1:** Required for v13.8 to truthfully claim adaptive, correctable guided conversation.
- **P2:** Add only after real use shows a repeatable friction or reuse opportunity.
- **P3:** Defer; does not validate the milestone's core behavior.

## Milestone Boundary

v13.8 is complete when a user can finish either path by handling one meaningful decision at a time, correct any mistaken assumption without starting over, repair asset failures inline, review the resulting brief/diagnosis, and explicitly confirm the proposed write or credit-bearing action. The journey must resume from persisted canonical state and produce telemetry that explains progression and repair without storing sensitive content.

v13.8 is not complete merely because the assistant emits more conversational copy around the current fixed panels. It also does not require a general agent platform, new creative-quality intelligence, new action contracts, or removal of the existing action-card confirmation boundary.

## Sources

### Repository Evidence (HIGH)

- `.planning/PROJECT.md` — milestone goal, target features, and guiding principle.
- `app/src/lib/guided-flow/types.ts`, `app/src/lib/hooks/use-guided-flow.ts` — current path/status/initial-step contract and client mutation boundary.
- `app/src/server/repositories/guided-flow.ts`, `app/src/server/db/schema.ts` — persisted guided-flow scope, slots, transitions, and telemetry tables.
- `app/src/components/assistant/FromZeroBriefPanel.tsx`, `CreativeDiagnosisPanel.tsx`, `FromZeroReferencesPanel.tsx`, `AssistantChatCore.tsx` — current monolithic panels and fixed step rendering.
- `app/src/server/assistant/guided-paths/from-zero.ts`, `existing-creative.ts` — fixed server transitions, missing-field derivation, diagnosis assumptions, and campaign side effects.
- `app/src/components/workspace/GuidedBriefingPanel.tsx`, `app/src/server/ai/guided-briefing.ts` — reusable progressive question, suggestion, edit, skip, and mapping behavior already present elsewhere in the app.
- `app/src/components/assistant/AssistantActionCard.tsx` — existing confirmation, risk, credit, and execution-status boundary.

### Established Interaction Guidance (HIGH)

- [GOV.UK Design System — Question pages](https://design-system.service.gov.uk/patterns/question-pages/) — one question at a time, back, unknown responses, and preserved answers.
- [GOV.UK Design System — Check answers](https://design-system.service.gov.uk/patterns/check-answers/) — editable review, return-to-review behavior, and dependent follow-up questions.
- [Google Conversation Design — Questions](https://developers.google.com/assistant/conversation-design/questions) — one question per turn, narrow-focus disambiguation, and high-cost confirmation.
- [Google Conversation Design — Confirmations](https://developers.google.com/assistant/conversation-design/confirmations) — implicit vs explicit confirmation and one-step corrections.
- [Google Conversation Design — Errors](https://developers.google.com/assistant/conversation-design/errors) — context-specific repair, escalating help, and transparent system-error recovery.
- [W3C WAI — Multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/) — logical stages, progress, optional steps, and review of completed steps.
- [W3C WAI — Validating input](https://www.w3.org/WAI/tutorials/forms/validation/) — forgiving input, client/server validation, correction, undo, and confirmation for consequential changes.
- [W3C WAI — User notification](https://www.w3.org/WAI/tutorials/forms/notifications/) — concise inline and overall feedback for dynamic success/error states.
- [U.S. Web Design System — Progress easily](https://designsystem.digital.gov/patterns/complete-a-complex-form/progress-easily/) — progressive disclosure and step-by-step reduction of cognitive load.

---
*Feature research for: ADScale v13.8 Conversa Guiada Adaptativa*
*Researched: 2026-06-26*
