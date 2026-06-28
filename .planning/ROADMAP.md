# Roadmap: ADScale

## Milestones

- 📋 **v13.9 Copiloto Criativo Iterativo** - Phases 203-207 (defined 2026-06-27)
- ✅ **v13.8 Conversa Guiada Adaptativa** - Phases 195-202 closed 2026-06-27 ([audit](milestones/v13.8-MILESTONE-AUDIT.md); live evidence debt accepted by owner)
- ✅ **v13.7 Qualidade Operacional das Jornadas Guiadas** - Phases 190-194 (shipped 2026-06-26; tech debt: human staging walks + insufficient operational sample)
- ✅ **v13.6 Jornadas Guiadas do Chat Estratégico** - Phases 184-189 (shipped 2026-06-26; tech debt: staging diagnosis/briefing + live lifecycle verify)
- ✅ **v13.5 Assistente Conversacional de Ações** - Phases 177-183 (shipped 2026-06-25; tech debt: EXEC-04 live lifecycle human verify, migrations 0056/0057 ops)
- ✅ **v13.4 Fechamento de Evidência Operacional** - Phases 173-176 (shipped 2026-06-25; tech debt: live DB seed pending, operational `insufficient_sample`)
- ✅ **v13.3 Tracao Multi-Cliente** - Phases 168-172 (shipped 2026-06-25; tech debt: operational evidence `insufficient_sample`, live owner smoke pending)
- ✅ **v13.2 Calibracao Multi-Marca** - Phases 162-167 (shipped 2026-06-24; tech debt: generic real-client evidence still needed)
- 🔄 **v13.1 Global Owner Quality Corpus** - Phases 157-161 (passed_with_tech_debt — commit pending)
- ✅ **v13.0 Brand Taste Calibration Loop** - Phases 151-156 (shipped 2026-06-20; tech debt: fixture-only corpus, agreement claims blocked)
- ✅ **v12.9 Fechamento Humano do Olhar Cenbrap** - Phases 147-150 (shipped 2026-06-20; tech debt accepted as fixture/seed evidence only)
- ✅ **v12.8 Operacao Real do Olhar Cenbrap** - Phases 143-146 (shipped 2026-06-19; tech debt: synthetic_fixture corpus)
- ✅ **v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance** - Phases 138-142 (shipped 2026-06-19; tech debt partially closed by v12.8/v12.9)
- ✅ **v12.6 Operacao Live do Corpus de Qualidade** - Phases 134-137 (shipped 2026-06-18; tech debt: empty live corpus, template 135/136 fallbacks)
- ✅ **v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo** - Phases 129-133 (shipped 2026-06-17; tech debt: empty live corpus)
- ✅ **v12.4 Aprendizado de Qualidade dos Outputs** - Phases 124-128 (shipped 2026-06-17)
- ✅ **v12.3 Integridade Criativa** - Phases 115-123 (shipped 2026-06-16; QA-19 accepted gap)
- ✅ **v12.2 Refinamento Visual e Consistência da Interface** - Phases 109-114 (shipped 2026-06-14)
- ✅ **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (shipped 2026-06-12)
- ✅ **v12.0 Monetização Real** - Phases 97-102 (shipped 2026-06-11)

## Phases

- [x] **Phase 203: Artifact Version Foundation** - Persist immutable plan/creative versions, lineage, current pointer, scope, and safe snapshots. (completed 2026-06-27)
- [x] **Phase 204: Plan Iteration Loop** - Turn chat feedback into inspectable, confirmed, immutable plan revisions. (completed 2026-06-27)
- [x] **Phase 205: Creative Iteration Loop** - Generate creative revisions from feedback with exact lineage, credits, idempotency, and recovery. (completed 2026-06-28)
- [ ] **Phase 206: Version Compare and Approval** - Compare two versions, approve/promote current version, and reject stale conflicts.
- [ ] **Phase 207: Iterative Copilot Integration and UAT** - Integrate both artifact loops, telemetry, reload, browser coverage, and milestone audit.
- [x] **Phase 195: Adaptive Journey State and Transition Contract** - Make every guided turn resumable, correctable, deterministic, and conflict-safe.
- [x] **Phase 196: Progressive From-Zero Conversation** - Guide users through one briefing decision at a time and a readiness-gated editable review.
- [x] **Phase 197: Collaborative Existing-Creative Diagnosis** - Let users correct and approve a provisional diagnosis before any campaign mutation.
- [x] **Phase 198: Inline Assets and Recovery** - Keep scoped asset selection, upload, replacement, partial failure, and retry inside the active turn.
- [x] **Phase 199: Reviewed Actions, Accessibility, and Automated UAT** - Bind safe action confirmation to reviewed state and verify both journeys across interaction modes.
- [x] **Phase 200: Real Staging Evidence and Release Gate** - Prove both journeys in staging and publish a release verdict that keeps evidence gaps explicit.
- [x] **Phase 201: Automated UAT Gap Closure** - Automated browser matrix closed with mocked API; live-provider depth accepted as debt.
- [x] **Phase 202: Staging Release Gate** - Closed by explicit owner waiver; zero starts and unverified live evidence remain recorded.

## Phase Details

### Phase 203: Artifact Version Foundation
**Goal**: Give plans and creatives one immutable, scoped, resumable version model with a single current-version invariant.
**Depends on**: Phase 202
**Requirements**: VERS-01, VERS-02, VERS-03, VERS-04, SAFE-01, SAFE-03
**Success Criteria**:
  1. User can reload a thread and retrieve immutable plan/creative history with source, status, feedback, and provenance.
  2. Exactly one version per lineage is current; concurrent promotion cannot create two current versions.
  3. Cross-workspace, cross-client, cross-campaign, and cross-thread version access is rejected.
  4. Persisted snapshots pass allowlist checks and exclude reasoning, signed URLs, provider payloads, and unsafe prompt data.
**Plans**: TBD

### Phase 204: Plan Iteration Loop
**Goal**: Let users revise a creative plan through chat feedback without overwriting the approved plan.
**Depends on**: Phase 203
**Requirements**: PLAN-01, PLAN-02, PLAN-03, PLAN-04
**Success Criteria**:
  1. Feedback creates a proposed plan snapshot and semantic change summary while current plan remains unchanged.
  2. User reviews strategy, angle, hook, CTA, and constraint changes before confirmation.
  3. Confirmation creates one immutable child plan version linked to feedback, source version, and action.
  4. Reload preserves proposal, version lifecycle, and current plan.
**Plans**: 2 plans

Plans:
- [x] 204-01-PLAN.md — Core domain: semantic diff, proposal service, revise_creative_plan contract, confirm handler, draft persistence
- [ ] 204-02-PLAN.md — Orchestrator integration, API routes, summary-only action card, tests

### Phase 205: Creative Iteration Loop
**Goal**: Let users create recoverable creative revisions tied to exact source creative and plan versions.
**Depends on**: Phase 204
**Requirements**: CREV-01, CREV-02, CREV-03, CREV-04, SAFE-02
**Success Criteria**:
  1. Feedback on a selected creative creates a proposal describing intended visual change, format, references, writes, and credit impact.
  2. Confirmed generation creates one child creative version linked to source creative and exact plan version.
  3. Duplicate confirmation, callback, or retry cannot duplicate charges, jobs, or versions.
  4. Failure/cancellation keeps source current and exposes safe idempotent retry.
**Plans**: 4 plans

Plans:
- [ ] 205-01-PLAN.md — Creative iteration core domain: types, intent, digest, draft, proposal service with planVersionId binding
- [ ] 205-02-PLAN.md — refundCredits billing function, CreditConfirmModal, AssistantActionCard creative revision display
- [ ] 205-03-PLAN.md — revise_creative contract + handler (charge→enqueue→async), derivation job callbacks (version on success, refund on failure)
- [ ] 205-04-PLAN.md — Service facade, orchestrator unified intent classifier, creative-revisions draft API route

### Phase 206: Version Compare and Approval
**Goal**: Let users understand differences and explicitly choose the current plan or creative version.
**Depends on**: Phase 205
**Requirements**: COMP-01, COMP-02, APPR-01, APPR-02, APPR-03
**Success Criteria**:
  1. User can select two versions from one lineage and compare them without changing current state.
  2. Plan compare shows semantic fields; creative compare shows actual previews, safe metadata, and change summary.
  3. User can approve a ready version or promote an older version as current without spending credits or deleting history.
  4. Stale, superseded, cross-lineage, or concurrent approval is rejected with recoverable state.
**Plans**: TBD

### Phase 207: Iterative Copilot Integration and UAT
**Goal**: Prove the plan-to-creative iteration loop as one coherent, accessible, observable assistant workflow.
**Depends on**: Phase 206
**Requirements**: QA-01, QA-02
**Success Criteria**:
  1. Safe telemetry covers proposal, confirmation, generation, comparison, approval, promotion, failure, and retry.
  2. Repository/API/component/contract tests cover both artifact types, isolation, conflicts, idempotency, and recovery.
  3. Authenticated Playwright covers plan revision, creative revision, reload, compare, approve, promote, stale card, failure, and retry on desktop/mobile.
  4. Production build and v13.9 milestone audit pass with explicit claim boundaries.
**Plans**: TBD

### Phase 195: Adaptive Journey State and Transition Contract
**Goal**: Users can navigate, correct, resume, switch, and recover a guided journey without losing valid context or allowing stale/model-owned transitions.
**Depends on**: Phase 194
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06, FLOW-07
**Success Criteria** (what must be TRUE):
  1. User can reload a thread and resume the exact persisted question, answers, resources, review state, and recoverable error.
  2. User can go back or edit an earlier answer while unrelated confirmed answers remain and dependent diagnosis, readiness, or proposals become stale.
  3. User can switch paths or restart only after seeing what will be retained and cleared.
  4. User receives an explicit recovery choice when a stale tab or request loses a journey revision race, with no silent overwrite.
  5. Free text and guided controls produce the same legal server-owned journey transitions; neither the model nor client-supplied IDs can choose journey state directly.
**Plans**: TBD

### Phase 196: Progressive From-Zero Conversation
**Goal**: Users can turn an initial idea into a reviewed, action-ready briefing through a progressive and correctable conversation.
**Depends on**: Phase 195
**Requirements**: ZERO-01, ZERO-02, ZERO-03, ZERO-04, ZERO-05, ZERO-06
**Success Criteria** (what must be TRUE):
  1. User answers one meaningful briefing decision at a time using free text or valid quick replies, including `Não sei` and skip only where allowed.
  2. User sees contextual suggestions with visible provenance and can ignore or edit them; the turn remains usable when AI suggestions fail.
  3. Each accepted answer persists immediately and remains available after navigation, reload, or later correction.
  4. User can review and edit a compact briefing summary before moving to references or an action proposal.
  5. User cannot advance from briefing review until deterministic readiness rules for the intended action pass.
**Plans**: TBD

### Phase 197: Collaborative Existing-Creative Diagnosis
**Goal**: Users can inspect, correct, and approve a diagnosis of an existing creative before ADScale proposes or performs campaign changes.
**Depends on**: Phase 196
**Requirements**: DIAG-01, DIAG-02, DIAG-03, DIAG-04, DIAG-05
**Success Criteria** (what must be TRUE):
  1. User can analyze a selected or uploaded creative provisionally without creating or mutating a campaign.
  2. User sees observed facts, inferred assumptions, and uncertain or missing fields as distinct diagnosis content.
  3. User can accept or correct assumptions and missing fields in the conversation; corrections preserve unrelated facts while refreshing stale dependent diagnosis, readiness, and proposals.
  4. User must review and approve the current diagnosis snapshot before an improvement action proposal appears.
**Plans**: TBD

### Phase 198: Inline Assets and Recovery
**Goal**: Users can manage all journey resources in context and recover from individual upload or analysis failures without losing successful work.
**Depends on**: Phase 197
**Requirements**: ASSET-01, ASSET-02, ASSET-03, ASSET-04
**Success Criteria** (what must be TRUE):
  1. User can select or upload a base creative and visual references without leaving the active guided turn.
  2. User can add, remove, or replace resources while successful items stay selected if another item fails.
  3. User cannot advance from the from-zero reference step until at least three valid references scoped to the current workspace and client are ready.
  4. User can retry failed upload or analysis safely without duplicate effects, and late results for stale revisions or replaced assets cannot overwrite current intent.
**Plans**: TBD

### Phase 199: Reviewed Actions, Accessibility, and Automated UAT
**Goal**: Users can understand and safely confirm current actions in either journey, with accessible interaction and comprehensive automated regression coverage.
**Depends on**: Phase 198
**Requirements**: ACT-01, ACT-02, ACT-03, ACT-04, QA-01, QA-02, QA-03
**Success Criteria** (what must be TRUE):
  1. User sees each action card in terms of expected outcome, required writes, credit impact, and irreversible effects rather than internal action or job names.
  2. User cannot confirm a stale card, and confirmation revalidates workspace/client scope, current inputs, reviewed snapshot, readiness, credits, and action policy.
  3. After action success, cancellation, or failure, the journey reaches a deterministic resumable state without duplicate effects.
  4. Operator can query safe telemetry for answer, edit, back, switch, restart, retry, conflict, proposal, confirmation, failure, and completion events.
  5. Both journeys pass authenticated browser coverage for happy path and recovery scenarios and remain operable by keyboard, coherent focus/status announcements, accessible errors, and mobile layout.
**Plans**: TBD

### Phase 200: Real Staging Evidence and Release Gate
**Goal**: Operators can distinguish implemented behavior from real integration proof and release v13.8 only with an evidence-honest verdict.
**Depends on**: Phase 199
**Requirements**: QA-04
**Success Criteria** (what must be TRUE):
  1. Operator can inspect separate release evidence for implementation, automated verification, authenticated real staging walks, and operational sample sufficiency.
  2. Staging evidence exercises both journeys with real provider, storage, persistence, action confirmation, recovery, resume, and telemetry, or names the exact pending human/live blocker.
  3. Release claims remain blocked when staging evidence is pending, guided starts remain zero or insufficient, or the inherited live Inngest lifecycle is unverified.
**Plans**: TBD

### Phase 201: Automated UAT Gap Closure
**Goal**: Close QA-02 and QA-03 with full authenticated Playwright scenario matrix and accessibility coverage.
**Depends on**: Phase 200
**Requirements**: QA-02, QA-03
**Gap Closure**: Closes audit tech debt for partial accessibility and Playwright matrices.
**Success Criteria** (what must be TRUE):
  1. Playwright covers correction, reload/resume, switch/restart, replacement, retry, conflict, stale card, and confirmation for both journeys (mocked API).
  2. Keyboard navigation, focus, status announcements, and accessible errors verified in component and browser tests.
  3. Login helper retries reduce intermittent auth flakes in guided E2E.
**Plans**: 201-01

### Phase 202: Staging Release Gate
**Goal**: Pass v13.8 release gate without staging bypass and archive milestone when evidence is complete.
**Depends on**: Phase 201
**Requirements**: QA-04 (evidence completion)
**Gap Closure**: Closes human staging, operational sample, and live Inngest lifecycle gaps.
**Success Criteria** (what must be TRUE):
  1. Both journeys recorded in staging evidence with safe operator notes.
  2. Operational guided starts ≥5 with `sufficient` sample status.
  3. Live Inngest action lifecycle verified with safe evidence note.
  4. `npm run v13-8-release-gate` passes without `--allow-pending-staging`.
**Plans**: 202-01

## Inherited Evidence Debt

- Operational guided-journey sample starts at zero and remains insufficient until real starts are observed.
- Human staging walks for live diagnosis and briefing remain pending.
- Live Inngest action lifecycle verification remains inherited and must stay explicit in the Phase 200 verdict.

## Shipped: v13.7 Qualidade Operacional das Jornadas Guiadas

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 190 | Guided Journey Telemetry | 1/1 | Complete |
| 191 | Operational Funnel Surface | 1/1 | Complete |
| 192 | Staging Evidence Runbook | 1/1 | Complete |
| 193 | Human Quality Feedback | 1/1 | Complete |
| 194 | Operational Release Gate | 1/1 | Complete |

Audit: [v13.7-MILESTONE-AUDIT.md](milestones/v13.7-MILESTONE-AUDIT.md)

## Shipped: v13.6 Jornadas Guiadas do Chat Estratégico

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 184 | Guided Flow State | 2/2 | Complete |
| 185 | Assistant Entry UX | 2/2 | Complete |
| 186 | Existing Creative Path | 2/2 | Complete |
| 187 | From-Zero Path | 2/2 | Complete |
| 188 | Action Integration and UAT | 2/2 | Complete |
| 189 | v13.6 Ship Gate | 1/1 | Complete |

Audit: [v13.6-MILESTONE-AUDIT.md](milestones/v13.6-MILESTONE-AUDIT.md)

### Phase 184: Guided Flow State (reference)

**Goal:** Persist guided assistant journey state in a dedicated, scoped, resumable model.

**Requirements:** FLOW-01, FLOW-02, FLOW-03, FLOW-04

**Success criteria:**
1. Repository/API layer can create, read and update a guided flow by workspace, clientProfile and thread.
2. State records path, status, current step, slots, missing fields, asset ids, reference ids and optional campaign id.
3. Cross-workspace, cross-client and cross-thread mutations are rejected.
4. Persisted payloads cannot include reasoning/thinking, signed URLs, raw tool args or internal evidence.

### Phase 185: Assistant Entry UX

**Goal:** Replace the generic assistant start with two primary guided journey cards while preserving freeform chat entry.

**Requirements:** ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04

**Success criteria:**
1. `/assistant` start surface presents `Já tenho peça` and `Produzir do zero` as primary cards above the composer.
2. Freeform first messages are classified into a path or answered with one clarifying question.
3. Returning to an existing thread shows path, step, missing inputs and next action.
4. Desktop and mobile assistant layouts expose the same primary path choices without overlap.

### Phase 186: Existing Creative Path

**Goal:** Let users start from an existing creative, extract context, diagnose it and receive a confirmable improvement action.

**Requirements:** EXIST-01, EXIST-02, EXIST-03, EXIST-04, EXIST-05

**Success criteria:**
1. User can upload or select a creative piece from the `Já tenho peça` path.
2. The flow creates or links a draft campaign only after a valid creative asset exists for the selected client profile.
3. Auto-briefing produces a briefing snapshot from the piece where current behavior supports it.
4. Diagnosis summarizes creative issues, assumptions, missing inputs and recommended next action.
5. User can confirm a proposed improvement action without re-entering extracted briefing fields.

### Phase 187: From-Zero Path

**Goal:** Let users produce from zero by collecting a minimum strategic brief and at least 3 visual references before campaign creation.

**Requirements:** ZERO-01, ZERO-02, ZERO-03, ZERO-04, ZERO-05, ZERO-06

**Success criteria:**
1. User can start `Produzir do zero` without immediately creating an empty campaign.
2. User can combine saved client references and new workspace uploads as visual references.
3. The plan action is blocked until at least 3 visual references are selected.
4. The minimum brief captures product/offer, audience, promise/objective, objections, CTA, platforms and constraints.
5. Draft campaign is created only after creative plan approval and carries selectedReferenceIds plus briefing fields.
6. The first ready action is a creative plan, not image generation.

### Phase 188: Action Integration and UAT

**Goal:** Wire both guided paths to safe confirmable actions and prove the assistant journeys through automated and human-readable evidence.

**Requirements:** ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, QA-01, QA-02, QA-03, QA-05

**Success criteria:**
1. Cost/write operations still require confirmable assistant action cards.
2. Existing-creative actions preserve uploaded creative as factual/base context.
3. From-zero actions treat references as auxiliary visual direction and preserve literal CTA, offer and constraints.
4. Async action payloads expose safe status/job links without denied persistence keys.
5. Failed or canceled actions leave the guided flow resumable with a safe error and next step.
6. Component, repository/API, contract and authenticated Playwright smoke coverage pass for both journeys.
7. Milestone audit clearly separates implemented assistant flow from deferred live OpenAI/Inngest human verification.

### Phase 189: v13.6 Ship Gate

**Goal:** Close the v13.6 release truth gap by proving first action-card confirmation at the browser layer and keeping staging-only human verification explicit.

**Requirements:** QA-04, QA-05

**Success criteria:**
1. Authenticated Playwright smoke renders a guided action card and confirms it through the browser confirm route.
2. Requirements, roadmap, state and milestone audit agree on the same v13.6 status.
3. Any remaining staging/provider/live-human verification is documented as explicit tech debt, not hidden under shipped language.

## Shipped Milestones (detail)

<details>
<summary>✅ v13.5 Assistente Conversacional de Ações (Phases 177-183) — SHIPPED 2026-06-25</summary>

Chat-first assistant with multi-client foundation, conversation persistence, MiniMax orchestration, action contracts, `/assistant` surface, quick actions, and campaign-complete happy path.

- [x] Phase 177: Multi-Client Foundation (1/1 plans)
- [x] Phase 178: Conversation Persistence (4/4 plans)
- [x] Phase 179: Model Adapter and Tool Policy (4/4 plans)
- [x] Phase 180: Action Contracts (4/4 plans)
- [x] Phase 181: Assistant Surface (5/5 plans)
- [x] Phase 182: Quick Actions (2/2 plans)
- [x] Phase 183: Campaign Complete Happy Path (2/2 plans)

Archive: [v13.5-ROADMAP.md](milestones/v13.5-ROADMAP.md) · [v13.5-REQUIREMENTS.md](milestones/v13.5-REQUIREMENTS.md) · [v13.5-MILESTONE-AUDIT.md](milestones/v13.5-MILESTONE-AUDIT.md)

**Tech debt:** EXEC-04 live lifecycle human verify; apply migrations 0056/0057 in staging/prod.

</details>

<details>
<summary>✅ v13.4 Fechamento de Evidência Operacional (Phases 173-176) — SHIPPED 2026-06-25</summary>

Archive: [v13.4-ROADMAP.md](milestones/v13.4-ROADMAP.md) · [v13.4-REQUIREMENTS.md](milestones/v13.4-REQUIREMENTS.md) · [v13.4-MILESTONE-AUDIT.md](milestones/v13.4-MILESTONE-AUDIT.md)

</details>

<details>
<summary>✅ v13.3 Tracao Multi-Cliente (Phases 168-172) — SHIPPED 2026-06-25</summary>

Archive: [v13.3-ROADMAP.md](milestones/v13.3-ROADMAP.md) · [v13.3-REQUIREMENTS.md](milestones/v13.3-REQUIREMENTS.md) · [v13.3-MILESTONE-AUDIT.md](milestones/v13.3-MILESTONE-AUDIT.md)

</details>

## Progress

**Execution Order:** 203 → 204 → 205 → 206 → 207

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 203. Artifact Version Foundation | 2/2 | Complete    | 2026-06-27 |
| 204. Plan Iteration Loop | 2/2 | Complete    | 2026-06-27 |
| 205. Creative Iteration Loop | 4/4 | Complete   | 2026-06-28 |
| 206. Version Compare and Approval | 0/TBD | Not started | — |
| 207. Iterative Copilot Integration and UAT | 0/TBD | Not started | — |
