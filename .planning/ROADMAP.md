# Roadmap: ADScale

## Milestones

- 🔄 **v13.6 Jornadas Guiadas do Chat Estratégico** - Phases 184-188 (active; started 2026-06-26)
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

## Active Milestone

### v13.6 Jornadas Guiadas do Chat Estratégico

**Milestone Goal:** Tornar o modo chat menos genérico, conduzindo o usuário por fluxos acionáveis conforme a origem do trabalho criativo.

**Requirements:** 29 total, 29 mapped

| Phase | Name | Plans | Status | Target |
|-------|------|-------|--------|--------|
| 184 | Guided Flow State | 2/2 | Complete | Persistência e APIs |
| 185 | Assistant Entry UX | 2/2 | Complete | Dois cards iniciais |
| 186 | Existing Creative Path | 0/0 | Pending | Diagnóstico acionável |
| 187 | From-Zero Path | 0/0 | Pending | Plano com 3 referências |
| 188 | Action Integration and UAT | 0/0 | Pending | Action cards e smoke |

### Phase 184: Guided Flow State

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

**Requirements:** ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, QA-01, QA-02, QA-03, QA-04, QA-05

**Success criteria:**
1. Cost/write operations still require confirmable assistant action cards.
2. Existing-creative actions preserve uploaded creative as factual/base context.
3. From-zero actions treat references as auxiliary visual direction and preserve literal CTA, offer and constraints.
4. Async action payloads expose safe status/job links without denied persistence keys.
5. Failed or canceled actions leave the guided flow resumable with a safe error and next step.
6. Component, repository/API, contract and authenticated Playwright smoke coverage pass for both journeys.
7. Milestone audit clearly separates implemented assistant flow from deferred live OpenAI/Inngest human verification.

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

**Active:** v13.6 — started 2026-06-26

**Next:** `$gsd-discuss-phase 186 --auto`
