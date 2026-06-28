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
- [x] **Phase 206: Version Compare and Approval** - Compare two versions, approve/promote current version, and reject stale conflicts. (completed 2026-06-28)
- [ ] **Phase 207: Iterative Copilot Integration and UAT** - Integrate both artifact loops, telemetry, reload, browser coverage, and milestone audit.

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

**Plans**: 4 plans

Plans:

- [x] 206-01-PLAN.md — Comparison DTOs, semantic diff, compare route
- [x] 206-02-PLAN.md — Approval history, promotion service, promote/ack routes
- [x] 206-03-PLAN.md — Client hooks, VersionHistory timeline
- [x] 206-04-PLAN.md — VersionComparisonDialog, AssistantChatCore integration

### Phase 207: Iterative Copilot Integration and UAT

**Goal**: Prove the plan-to-creative iteration loop as one coherent, accessible, observable assistant workflow.
**Depends on**: Phase 206
**Requirements**: QA-01, QA-02
**Success Criteria**:

  1. Safe telemetry covers proposal, confirmation, generation, comparison, approval, promotion, failure, and retry.
  2. Repository/API/component/contract tests cover both artifact types, isolation, conflicts, idempotency, and recovery.
  3. Authenticated Playwright covers plan revision, creative revision, reload, compare, approve, promote, stale card, failure, and retry on desktop/mobile.
  4. Production build and v13.9 milestone audit pass with explicit claim boundaries.

**Plans**: 5 plans

Plans:
**Wave 1**

- [ ] 207-01-PLAN.md — Artifact-iteration telemetry table, sanitizer, repository

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 207-02-PLAN.md — Service-boundary emits + owner analytics route
- [ ] 207-03-PLAN.md — Nyquist test gaps: cross-thread, reload, stale card

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 207-04-PLAN.md — Playwright desktop/mobile iteration loop E2E

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 207-05-PLAN.md — v13.9 release gate + milestone audit

## Inherited Evidence Debt

- Operational guided-journey sample starts at zero and remains insufficient until real starts are observed.
- Human staging walks for live diagnosis and briefing remain pending.
- Live Inngest action lifecycle verification remains inherited and must stay explicit in the Phase 200 verdict.

## Progress

**Execution Order:** 203 → 204 → 205 → 206 → 207

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 203. Artifact Version Foundation | 2/2 | Complete    | 2026-06-27 |
| 204. Plan Iteration Loop | 2/2 | Complete    | 2026-06-27 |
| 205. Creative Iteration Loop | 4/4 | Complete    | 2026-06-28 |
| 206. Version Compare and Approval | 4/4 | Complete   | 2026-06-28 |
| 207. Iterative Copilot Integration and UAT | 0/5 | Planned | — |
