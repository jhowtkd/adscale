# Project Research Summary

**Project:** ADScale — v13.8 Conversa Guiada Adaptativa
**Domain:** Adaptive guided conversation in an AI creative campaign assistant
**Researched:** 2026-06-26
**Confidence:** HIGH

## Executive Summary

ADScale v13.8 should turn the two existing `/assistant` journeys—`Produzir do zero` and `Já tenho peça`—from fixed forms into progressive, correctable conversations. This is a state-contract and interaction redesign inside the existing Next.js application, not a new agent platform. The correct architecture is a versioned, server-owned journey aggregate with typed commands, deterministic transitions, optimistic concurrency, and canonical persisted answers. The model may extract values, diagnose uncertainty, and suggest wording, but it must never choose the next state or execute effects.

Implementation should preserve the current stack and add no dependencies. Build the transition contract and persistence safety first; then migrate each journey independently, add inline asset/reference lifecycle handling, and bind reviewed journey snapshots to the existing action-card confirmation boundary. Every correction, backtrack, path switch, retry, and resume must update canonical state and invalidate only dependent derived values. Campaign creation, credit use, generation, memory writes, and exports remain impossible until the user reviews the current snapshot and explicitly confirms an action.

The largest risks are competing sources of truth, cosmetic backtracking, stale async results, premature writes, cross-client prompt injection, and false release confidence from mocked tests. Prevent them with exhaustive transition tests, revision-bound commands and async results, strict workspace/client scope checks, immutable reviewed action snapshots, accessible interaction contracts, and a separate final phase for authenticated staging evidence. v13.8 is not complete until both real-provider journeys demonstrate correction, recovery, confirmation, resume, and telemetry in staging; automated green alone is insufficient.

## Key Findings

### Recommended Stack

Use the existing application stack as-is. The milestone needs stronger domain contracts and persistence semantics, not another workflow, state-management, form, realtime, or AI orchestration library. Keep canonical state in `assistant_guided_flows`, validate its JSONB payload with path-specific Zod schemas, and expose one command mutation boundary with compare-and-swap revision checks.

**Core technologies:**

- Next.js App Router `16.2.6`: scoped journey read/command Route Handlers inside the existing assistant backend.
- React / React DOM `19.2.4`: one-decision-at-a-time turns, editable summaries, inline resources, and accessible controls.
- TypeScript `^5` + Zod `^3.0.0`: exhaustive command/state unions and runtime validation at persistence, HTTP, model, and UI boundaries.
- Drizzle ORM `^0.45.2` + Neon PostgreSQL driver `^1.1.0`: canonical snapshots, `revision`, `schema_version`, and atomic flow/transition-audit writes.
- TanStack Query `^5.100.1`: authoritative server-state refresh, mutation feedback, and explicit conflict recovery.
- OpenAI SDK `^6.34.0`: bounded extraction, diagnosis, and contextual suggestions only, always Zod-validated with deterministic fallback.
- Existing upload/R2 stack: inline select, upload, replace, remove, and retry without introducing a second media path.
- Vitest `^4.1.5`, Testing Library, and Playwright `^1.60.0`: transition matrices, accessible component behavior, browser regression, and staging evidence.

**Critical stack requirements:**

- Add no runtime or development dependencies for v13.8.
- Replace generic `PATCH currentStep/slots` mutations with typed commands carrying `commandId` and `expectedRevision`.
- Add `revision` and `schema_version`; parse or migrate every persisted state before use.
- Keep the pure transition reducer free of database, provider, telemetry, and campaign side effects.
- Bind async provider/upload results and action cards to the source revision and relevant asset/snapshot digest.

### Expected Features

**Must have (table stakes):**

- One meaningful decision per turn, with deterministic state-aware question selection.
- Quick replies plus free text, with explicit `Não sei`, suggestion, and skip behavior only where valid.
- Visible inferred understanding, provenance, and lightweight correction.
- Semantic back, edit, switch-path, restart, retry, and exact persisted resume.
- Editable brief or diagnosis summary before any action proposal.
- Dependency-aware invalidation that preserves unrelated confirmed answers.
- Inline asset/reference select, upload, replace, remove, partial-failure recovery, and retry.
- Stable phase-oriented progress rather than a false fixed step count.
- Outcome-oriented action cards with explicit write/cost confirmation.
- Keyboard, focus, status-announcement, mobile, and error-recovery accessibility.
- Safe adaptive telemetry and real staging UAT for both paths.

**Should have (competitive):**

- Creative-readiness routing that asks only what the next useful action requires.
- Uncertainty-led repair of diagnosis assumptions in `Já tenho peça`.
- Compact suggestion provenance such as `Da peça`, `Da marca`, or `Sugestão`.
- Dual-mode acceleration: guided turns by default, editable summary for experienced users.
- Repair telemetry that distinguishes normal progress from correction, confusion, conflict, and recovery.

**Defer (v13.8.x or v14+):**

- Telemetry-tuned question ordering and cross-thread answer reuse until real usage proves value.
- Richer provenance drill-down, bulk-edit refinements, and alternative-reference recommendations until observed friction justifies them.
- New journey types, model-learned question policy, arbitrary natural-language orchestration, multi-user collaborative editing, and voice.
- Generic workflow builders, autonomous agents, XState, new recommendation intelligence, and any new orchestration framework.

### Architecture Approach

Place a guided-conversation application/domain layer around the existing `assistant_guided_flows` aggregate. UI controls and free-text interpretation both produce the same typed commands. A pure transition function validates legal state changes and declares effects; a server-only service performs scoped compare-and-swap persistence and appends a durable transition audit in one transaction; a presenter builds the serializable prompt, progress, summary, and allowed controls. Operational telemetry remains derived and best-effort, never the state ledger.

**Major components:**

1. **Versioned journey state and definitions** — path-specific schemas, requiredness, guards, dependencies, legal commands, back targets, and readiness predicates.
2. **Deterministic transition engine** — applies answer, edit, back, switch, restart, resource, retry, review, and completion commands without side effects.
3. **Transactional command service and repository** — validates scope/revision, persists state plus transition audit atomically, and enforces idempotency.
4. **Interpreter and presenter** — converts open text into a proposed typed command when needed and renders the current server-authoritative turn; AI remains advisory.
5. **Reviewed action snapshot guard** — binds action cards to flow revision and digest, superseding stale cards after material edits.
6. **Generic guided UI and inline resources** — renders progressive turns, summaries, navigation, assets, references, conflicts, and accessible recovery without a client-side state machine.

**Key invariants:**

- Only the server transition service changes path, step, status, answers, resources, or review state.
- Messages are conversation evidence; persisted typed state is canonical.
- Corrections invalidate dependent derived data and stale cards, never unrelated confirmed facts.
- `existing_creative` diagnosis remains provisional; campaign writes move behind confirmed execution.
- IDs and resource ownership are always resolved server-side within workspace, client, and thread scope.
- Telemetry failure cannot block a valid transition, and telemetry cannot reconstruct state.

### Critical Pitfalls

1. **Multiple sources of truth and lost updates** — use versioned canonical state, typed commands, a durable transition audit, and `expectedRevision` compare-and-swap with explicit `409` recovery.
2. **Writes or credit spend during conversation** — separate interpret, reversible transition, proposal, and confirm/execute; assert zero campaign, credit, generation, memory, or export effects before explicit confirmation.
3. **Cosmetic correction/backtracking** — model dependencies and provenance, implement explicit unset/stale semantics, regenerate summaries from canonical state, and invalidate stale action snapshots.
4. **Prompt injection or cross-client leakage** — treat user/OCR/reference text as untrusted data, keep model context allowlisted and client-scoped, reject model-selected IDs/events, and test cross-client canaries.
5. **Duplicate effects and stale async completion** — persist idempotent command identities, bind provider/upload results to source revision and asset IDs, and reject late results that no longer match current intent.
6. **False readiness and thin evidence** — derive completion from server invariants, separate proposal/confirmation/effect statuses, and require authenticated staging evidence beyond mocked tests.

## Implications for Roadmap

Based on the combined research, v13.8 should use six phases beginning at 195.

### Phase 195: Adaptive Journey State and Transition Contract

**Rationale:** Every later feature depends on one authoritative state model. Building UI adaptation before revision safety, legal transitions, dependency invalidation, and confirmation boundaries would create rework and unsafe behavior.

**Delivers:** Versioned path-specific state, typed command union, pure transition reducer, readiness predicates, dependency invalidation, back/edit/switch/restart/resume semantics, optimistic concurrency, idempotent command handling, durable transition audit, migration of legacy states, and the scoped command route.

**Addresses:** Deterministic state-aware progression; canonical answer provenance/status; correction and resume foundations.

**Avoids:** State/model drift, arbitrary step patches, lost updates, transcript-derived state, cosmetic backtracking, model-owned transitions, and accidental pre-confirmation effects.

### Phase 196: Progressive From-Zero Conversation

**Rationale:** `Produzir do zero` has the clearest reusable progressive-briefing precedent and should prove the generic turn/presenter contract before the more uncertain diagnosis journey.

**Delivers:** One-question-at-a-time briefing, deterministic requiredness/skipping, AI suggestions only, quick replies plus free text, unknown/skip semantics, provenance, immediate partial persistence, stable phase progress, editable summary, direct return to review after correction, and accessible turn behavior.

**Addresses:** Progressive prompting, contextual suggestions, editable review, dual-mode acceleration, and dependency-aware correction for product, offer, audience, promise, CTA, platforms, and constraints.

**Avoids:** All-at-once forms, confirmation fatigue, silent inference, fixed percentage progress, model-selected questions, and punitive replay after edits.

### Phase 197: Collaborative Existing-Creative Diagnosis

**Rationale:** This path carries higher factual and side-effect risk. It should reuse the proven transition/presentation primitives while changing current campaign-write behavior explicitly.

**Delivers:** Provisional asset analysis, separation of observed facts from inferred assumptions, uncertainty-ranked questions, user correction/acceptance of premises, dependency-aware diagnosis refresh, editable reviewed diagnosis, and an improvement snapshot without campaign creation.

**Addresses:** Uncertainty-led diagnosis repair, visible provenance, correction of missing fields, and preservation of high-confidence extracted facts.

**Avoids:** Campaign creation during diagnosis, hidden assumptions, prompt-injected journey control, stale diagnosis after corrections, and polished summaries that mask unresolved readiness.

### Phase 198: Inline Assets and Recovery

**Rationale:** Both journeys need consistent resource lifecycle behavior, but it should land after their canonical field and correction semantics are stable. This isolates upload/provider race and retry complexity from the core conversation migration.

**Delivers:** Typed resource envelopes; scoped select/upload/add/remove/replace; per-item processing, failure, and unattached states; preserved successful items on partial failure; minimum-reference guards; idempotent retries; stale upload/analysis-result rejection; and inline recovery for both paths.

**Addresses:** Inline references and base creative replacement without leaving the active turn.

**Avoids:** Duplicate uploads/effects, late results overwriting newer intent, generic retries, hidden data carryover during path switches, and trusting client/model-supplied IDs.

### Phase 199: Reviewed Actions, Accessibility, and Automated UAT

**Rationale:** Action integration must consume the final canonical journey contracts, and cross-path accessibility/behavior verification belongs at the point where all interactive surfaces exist.

**Delivers:** Outcome-oriented action cards bound to flow revision and reviewed snapshot digest; stale-card supersession; confirm-time scope/input/credit revalidation; deterministic success/failure transitions; journey-first chat interpretation; generic adaptive UI; telemetry extensions; transition-matrix and browser coverage for correction, conflict, retry, injection, resume, mobile, keyboard, focus, and status announcements.

**Addresses:** Clear execution preview, explicit confirmation, safe action handoff, accessible recovery, and queryable adaptive behavior.

**Avoids:** Conversational approval ambiguity, execution from stale summaries, direct write tools, inaccessible dynamic turns, false completion semantics, and telemetry as a ledger.

### Phase 200: Real Staging Evidence and Release Gate

**Rationale:** v13.7 already carries missing human staging evidence and zero observed starts. v13.8 must close its own real integration proof rather than inheriting another automated-only green status.

**Delivers:** Authenticated staging walks for both paths using real provider, upload/storage, persistence, action confirmation, and telemetry; correction/backtrack, switch/restart, reload/resume, failed/retried resource and action, stale card, injection fixture, and competing-tab evidence; reconciliation against durable flow/action records; and a release verdict that separates implementation, automated verification, staging evidence, and operational sample sufficiency.

**Addresses:** Truthful completion and operational confidence for the entire milestone.

**Avoids:** Happy-path-only screenshots, mocked-provider evidence presented as live proof, empty staging records summarized as green, and quality/completion claims from insufficient sample.

### Phase Ordering Rationale

- Phase 195 is the dependency root: state, concurrency, correction, and action safety must exist before adaptive UI work.
- Phases 196 and 197 validate the shared engine through distinct bounded paths while keeping path-specific rules explicit.
- Phase 198 centralizes the cross-path async resource lifecycle after field dependencies are stable.
- Phase 199 integrates immutable reviewed snapshots, existing action contracts, accessibility, and full deterministic regression once all user-visible paths exist.
- Phase 200 is intentionally separate so implementation green cannot conceal missing real staging proof or inherited sample debt.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 198:** inspect the exact current upload, workspace-asset, signed-preview, diagnosis-job, and retry boundaries before locking resource-state and stale-result semantics.
- **Phase 200:** inspect the live staging authentication, provider, storage, action/Inngest lifecycle, telemetry query, and evidence artifact contracts; inherited v13.7 staging debt makes assumptions unsafe.

Phases with standard patterns (skip research-phase):

- **Phase 195:** repository evidence and research already specify the state envelope, command boundary, CAS behavior, audit, invariants, and build order in detail.
- **Phase 196:** progressive question, editable review, accessibility, and existing ADScale guided-briefing patterns are well documented.
- **Phase 197:** path behavior and required provisional-write correction are repository-specific but already mapped precisely in architecture research.
- **Phase 199:** existing action contracts, confirmation routes, telemetry allowlists, Testing Library, and Playwright provide established integration patterns; planning should focus on coverage, not technology discovery.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions and integration boundaries were verified against the live repository; no dependency gap was found. |
| Features | HIGH | Table stakes align across established government/accessibility conversation patterns and existing ADScale interaction contracts. Exact branch ordering remains MEDIUM until staging telemetry exists. |
| Architecture | HIGH | Current mutation, persistence, action, telemetry, and UI gaps were traced to concrete repository locations; the recommended command/aggregate pattern is mature. |
| Pitfalls | HIGH | Risks are grounded in the current unversioned snapshot, shallow merge, pre-review writes, best-effort telemetry, and inherited staging debt, with primary references for concurrency, safety, idempotency, and accessibility. |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact branching policy:** define deterministic requiredness and dependency tables during Phases 196-197, then tune ordering only from real repair/progression evidence.
- **Legacy-state migration:** inventory actual persisted v13.6/v13.7 slot shapes before deciding migrate, compatibility-render, or explicit safe restart behavior.
- **Transition audit schema:** confirm whether a new append-only table is required or an existing durable record can satisfy command idempotency and debugging without conflating best-effort telemetry.
- **Async ownership:** map upload, image diagnosis, action, and Inngest completion callbacks to source revisions and define quarantine behavior for stale results.
- **Real staging availability:** confirm owner credentials, migrated database, provider configuration, storage, and action lifecycle before Phase 200 execution.
- **Operational sample:** keep completion/quality claims blocked if staging starts or user sample remain zero/insufficient; technical completion does not resolve sample sufficiency.

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` — v13.8 goal, active requirements, locked stack, confirmation principle, and inherited staging/sample debt.
- `.planning/research/STACK.md` — verified package versions, no-new-dependency recommendation, compatibility, and UAT stack contract.
- `.planning/research/FEATURES.md` — table stakes, differentiators, anti-features, dependencies, MVP boundary, and established interaction guidance.
- `.planning/research/ARCHITECTURE.md` — repository-traced component boundaries, data flow, invariants, integration points, and build order.
- `.planning/research/PITFALLS.md` — repository-specific failure modes, phase mapping, recovery strategy, and evidence requirements.
- Live ADScale guided-flow, repository, action-contract, orchestrator, upload, telemetry, component, and Playwright sources cited by the four research files.
- [GOV.UK Question pages](https://design-system.service.gov.uk/patterns/question-pages/) and [Check answers](https://design-system.service.gov.uk/patterns/check-answers/) — progressive questions, back/edit, preserved answers, and return-to-review behavior.
- [W3C WAI Multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/), [Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), and [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — accessible staged interaction, focus, and announcements.
- [OpenAI Safety in building agents](https://platform.openai.com/docs/guides/agent-builder-safety) and [Structured outputs](https://platform.openai.com/docs/guides/structured-outputs) — untrusted-input boundaries, tool approval, and schema-constrained suggestions.
- [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests) — stable retry and payload-fingerprint semantics.
- [Playwright documentation](https://playwright.dev/docs/best-practices) — deterministic browser coverage and trace-based failure evidence.

### Secondary (MEDIUM confidence)

- Google Conversation Design guidance — implicit versus explicit confirmation, one-step correction, and escalating repair patterns.
- Stately persistence/testing guidance — persisted state compatibility and model-based transition coverage; used as pattern guidance, not as a recommendation to add XState.

### Tertiary (LOW confidence)

- None. Unresolved items are explicitly listed as planning or staging gaps rather than asserted from weak evidence.

---
*Research completed: 2026-06-26*
*Ready for roadmap: yes*
