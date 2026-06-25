# Roadmap: ADScale

## Milestones

- 🚧 **v13.5 Assistente Conversacional de Ações** - Phases 177-183 (active — roadmap defined 2026-06-25)
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

### 🚧 v13.5 Assistente Conversacional de Ações (Phases 177-183)

**Milestone Goal:** Permitir que usuários operem ADScale por chat, com contratos mínimos por ação, preservando controle, créditos e isolamento multi-cliente.

**Guiding constraints:**
- O assistente não força formulário; ele pede o mínimo necessário para a próxima ação útil.
- Ações rápidas não exigem briefing completo quando o contrato da ação não precisa dele.
- Ações de escrita, crédito, memória, export/package ou job longo exigem action card confirmado.
- Contexto enviado ao provider é amplo, mas allowlistado; não enviar segredos, URLs assinadas brutas ou payloads internos crus.
- Review completo no assistente deve reutilizar componentes existentes, não duplicar a lógica visual do workspace.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 177 | Multi-Client Foundation | Complete    | 2026-06-25 | 2026-06-25 |
| 178 | 4/4 | Complete    | 2026-06-25 | - |
| 179 | 4/4 | Complete    | 2026-06-25 | - |
| 180 | Action Contracts | ACT-01, ACT-02, EXEC-01 | Pending | - |
| 181 | Assistant Surface | CHAT-01, CHAT-02, CHAT-03, CHAT-04 | Pending | - |
| 182 | Quick Actions | ACT-03, ACT-04 | Pending | - |
| 183 | Campaign Complete Happy Path | ACT-05, EXEC-03, EXEC-04 | Pending | - |

## Phase Details

### Phase 177: Multi-Client Foundation

**Goal:** Remover a limitação de um `clientProfile` por workspace e garantir que todos os dados de marca relevantes fiquem isolados por cliente.

**Depends on:** v13.2/v13.3 brand/clientProfile calibration infrastructure.

**Requirements:** CLIENT-01, CLIENT-02, CLIENT-03

**Success Criteria** (what must be TRUE):
  1. Workspace can create and list multiple `clientProfile` records without violating DB constraints.
  2. Brand kit, memory retrieval, references, voice config, corpus, and calibration rules resolve by `clientProfileId`.
  3. Existing campaigns keep working after migration and resolve their linked or inferred client profile deterministically.
  4. Regression tests prove no cross-client leakage in the updated scoped paths.

**Plans:** 1/1 plans complete

---

### Phase 178: Conversation Persistence

**Goal:** Persist assistant threads, messages, and action records with workspace/client/campaign scoping and job status support.

**Depends on:** Phase 177 client scope decisions.

**Requirements:** EXEC-02

**Success Criteria** (what must be TRUE):
  1. Server can create and retrieve threads scoped by workspace, client profile, and campaign.
  2. Messages preserve user, assistant, tool, and action-card history without storing provider reasoning/thinking.
  3. Action records support pending, confirmed, running, completed, failed, and canceled states.
  4. Long-running jobs can update or be reflected in the related assistant action status.

**Plans:** 4/4 plans complete

Plans:
- [ ] 178-01-PLAN.md — Schema, types, and migration 0057 for assistant tables
- [ ] 178-02-PLAN.md — Thread repository with client/campaign scoping and default thread
- [ ] 178-03-PLAN.md — Message stream and action record lifecycle repositories
- [ ] 178-04-PLAN.md — Inngest job sync wiring and REST API routes

---

### Phase 179: Model Adapter and Tool Policy

**Goal:** Introduce provider-agnostic assistant orchestration with MiniMax M3 as the first adapter and a server-side tool policy gate.

**Depends on:** Phase 178 persistence.

**Requirements:** AI-01, AI-02, AI-03, AI-04, AI-05

**Success Criteria** (what must be TRUE):
  1. `AssistantModelClient` supports streaming text through a provider adapter boundary.
  2. MiniMax M3 adapter can produce assistant responses through the internal interface.
  3. Context builder uses an allowlist and excludes secrets, raw signed URLs, internal evidence payloads, and out-of-scope customer data.
  4. Tool calls are validated by server-side policy before any execution or action-card creation.
  5. Tests prove provider reasoning/thinking is neither displayed nor persisted.

**Plans:** 4/4 plans complete

Plans:
- [ ] 179-01-PLAN.md — AssistantModelClient interface, MiniMax adapter, reasoning sanitizer (AI-01, AI-02, AI-05)
- [ ] 179-02-PLAN.md — Allowlisted context builder with sanitizer (AI-03)
- [ ] 179-03-PLAN.md — Tool registry and deny-by-default policy gate (AI-04)
- [ ] 179-04-PLAN.md — Orchestrator, SSE chat route, integration tests (AI-01–AI-05)

---

### Phase 180: Action Contracts

**Goal:** Define action contracts as the assistant's execution grammar: intent classification, required/optional inputs, roles, risk, credits, and confirmation.

**Depends on:** Phase 179 tool policy.

**Requirements:** ACT-01, ACT-02, EXEC-01

**Success Criteria** (what must be TRUE):
  1. User intent is classified into quick action or complete campaign flow before input collection.
  2. Each supported action exposes required inputs, optional inputs, role gates, risk labels, credit impact, and confirmation policy.
  3. Missing optional inputs produce honest risk copy rather than blocking the action.
  4. Writing or credit-impacting actions produce confirmed action cards before execution.

**Plans:** 0/1 plans complete

---

### Phase 181: Assistant Surface

**Goal:** Ship `/assistant` and campaign drawer as the primary conversational operating surface.

**Depends on:** Phases 178-180.

**Requirements:** CHAT-01, CHAT-02, CHAT-03, CHAT-04

**Success Criteria** (what must be TRUE):
  1. Authenticated user can open `/assistant` from primary navigation.
  2. Desktop assistant has three working areas: client/campaign/thread tree, chat, and contextual panel.
  3. User can create a client, create a campaign draft, and start a thread from the assistant.
  4. Campaign workspace drawer opens and continues the same campaign thread.
  5. Mobile layout remains usable through tabs or equivalent responsive navigation.

**Plans:** 0/1 plans complete

---

### Phase 182: Quick Actions

**Goal:** Prove quick actions can run through chat without forcing a complete briefing.

**Depends on:** Phase 180 contracts and Phase 181 surface.

**Requirements:** ACT-03, ACT-04

**Success Criteria** (what must be TRUE):
  1. User can run restyling from the assistant with only base image and style reference as required inputs.
  2. User can request format adaptation from an existing piece or output with only source and target format as required inputs.
  3. User can request regeneration with a target derivation and feedback, without filling unrelated campaign fields.
  4. Review, save-reference, and delivery package actions follow their own contracts and expose optional-missing risk copy when relevant.
  5. Quick action tests prove full briefing is not required for the supported quick paths.

**Plans:** 0/1 plans complete

---

### Phase 183: Campaign Complete Happy Path

**Goal:** Complete the chat-first campaign path from loose idea to final package, reusing existing generation and review primitives.

**Depends on:** Phases 177-182.

**Requirements:** ACT-05, EXEC-03, EXEC-04

**Success Criteria** (what must be TRUE):
  1. User can go from selected/created client and loose idea to a campaign draft with the complete-campaign minimum brief.
  2. User can confirm `Aplicar e gerar preview` with visible mode and credit impact.
  3. Preview generation, approval, batch generation, review, and delivery package creation run through existing pipeline/components where available.
  4. Assistant review surface reuses current review components rather than duplicating review logic.
  5. Playwright smoke covers the happy path from idea to final package.

**Plans:** 0/1 plans complete

---

## Completed Milestone Context

### ✅ v13.4 Fechamento de Evidência Operacional (Phases 173-176)

**Shipped 2026-06-25** with tech debt: operational evidence infrastructure complete; live `173-CORPUS-MANIFEST.json` not yet produced (DB migration required for `--confirm` seed).

Archive: [v13.4-ROADMAP.md](milestones/v13.4-ROADMAP.md) · [v13.4-REQUIREMENTS.md](milestones/v13.4-REQUIREMENTS.md) · [v13.4-MILESTONE-AUDIT.md](milestones/v13.4-MILESTONE-AUDIT.md)

### ✅ v13.3 Tracao Multi-Cliente (Phases 168-172)

**Shipped 2026-06-25** with tech debt: `operationalEvidence: insufficient_sample`, `activeBrandSample.fixtureOnly: true`, owner smoke pending.

Archive: [v13.3-ROADMAP.md](milestones/v13.3-ROADMAP.md) · [v13.3-REQUIREMENTS.md](milestones/v13.3-REQUIREMENTS.md) · [v13.3-MILESTONE-AUDIT.md](milestones/v13.3-MILESTONE-AUDIT.md)

## Progress

**Current milestone:** v13.5 — 0/7 phases complete

**Next phase:** 177 — Multi-Client Foundation (`$gsd-execute-phase 177`)
