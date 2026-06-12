# Roadmap: ADScale

## Milestones

- 🚧 **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (planned 2026-06-12)
- ✅ **v12.0 Monetização Real** - Phases 97-102 (shipped 2026-06-11)
- ✅ **v11.11 Aprendizado → Ação** - Phases 90-96 (shipped 2026-06-11)
- ✅ **v11.10 Fechamento Entrega e Analytics** - Phases 85-89 (shipped 2026-06-11)
- ✅ **v11.9 UX de Entrega e Créditos** - Phases 80-84 (shipped 2026-06-07)
- ✅ **v11.8 Loop de Aprendizado Beta** - Phases 75-79 (shipped 2026-06-07)
- ✅ **v11.7.1 Stabilization** - Phases 72-74 (shipped 2026-06-07)
- ✅ **v11.7 Ads Scientist Progression** - Phases 68-71 (shipped 2026-06-06)
- ✅ **v11.6.1 Ship Readiness and Beta Activation** - Phases 66-67 (shipped 2026-06-06)
- ✅ **v11.6 Creative Strategy Cockpit** - Phases 61-65 (shipped 2026-06-06)
- ✅ **v11.5 Qualidade IA Orientada por Feedback** - Phases 57-60 (shipped 2026-06-05)
- ✅ **v11.4 Beta Feedback Capture** - Phases 53-56 (shipped 2026-06-05)
- ✅ **v11.3 Site de Apresentação Separado** - Phases 50-52 (shipped 2026-06-03)
- ✅ **v11.2 Beta Access and Credit Entitlements** - Phase 49 (shipped 2026-06-03)
- ✅ **v11.1 Qualidade de Geração e Contratos Criativos** - Phases 44-48 (shipped 2026-06-01)
- ✅ **v11.0 Fluxos de Derivação Coerentes** - Phases 40-43 (shipped 2026-06-01)

## Phases

### 🚧 v12.1 Memória Criativa e Aprendizado de Performance (Phases 103-108) — PLANNED 2026-06-12

**Milestone Goal:** Associar hipóteses e derivações a resultados reais de mídia, consolidar aprendizados auditáveis por cliente no Postgres e recuperá-los via Mem0 para recomendar o próximo experimento com evidência e confiança explícitas.

- [x] **Phase 103: Performance Data Foundation** — contratos canônicos, migrações, métricas derivadas, lineage e isolamento (completed 2026-06-12)
- [x] **Phase 104: Manual and CSV Result Import** — entrada manual, mapeamento, preview, normalização, deduplicação e histórico (completed 2026-06-12)
- [x] **Phase 105: Creative Hypotheses and Variant Comparison** — hipóteses, comparabilidade e estados honestos de evidência
- [ ] **Phase 106: Client Performance Memory and Mem0** — aprendizados canônicos, contradições e projeção semântica sincronizada
- [ ] **Phase 107: Learning to Next Experiment** — recomendação explicável e prefill editável no cockpit existente
- [ ] **Phase 108: Performance Learning Release Gate** — regressão, migração, build e UAT com dados representativos

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 103 | Performance Data Foundation | PERF-13–16 | Complete | 2026-06-12 |
| 104 | Manual and CSV Result Import | IMPT-01–06 | Complete | 2026-06-12 |
| 105 | Creative Hypotheses and Variant Comparison | HYPO-01–03, COMP-05–08 | Complete | 2026-06-12 |
| 106 | Client Performance Memory and Mem0 | MEM-01–06 | Not started | - |
| 107 | Learning to Next Experiment | NEXT-01–04 | Not started | - |
| 108 | Performance Learning Release Gate | QA-10–13 | Not started | - |

## v12.1 Phase Details

### Phase 103: Performance Data Foundation

**Goal:** Criar a fonte canônica e auditável de resultados de mídia antes de qualquer importação, comparação ou memória.

**Requirements:** PERF-13, PERF-14, PERF-15, PERF-16

**Success Criteria:**
1. Registros persistem métricas brutas, moeda, plataforma, período, origem e vínculos válidos com cliente, campanha e derivação.
2. CTR, CPC, CPA e ROAS são derivados de forma determinística e segura para valores ausentes ou denominadores zero.
3. Identidade de origem e constraints suportam atualização de janela de atribuição sem duplicação silenciosa.
4. Repositórios e APIs rejeitam qualquer associação fora do workspace autenticado.
5. Migração e fixtures cobrem moedas, plataformas, períodos e derivações representativas.

### Phase 104: Manual and CSV Result Import

**Goal:** Permitir que o usuário registre resultados confiáveis sem depender de APIs das plataformas de mídia.

**Depends on:** Phase 103

**Requirements:** IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05, IMPT-06

**Success Criteria:**
1. Entrada manual e CSV produzem o mesmo contrato canônico de performance.
2. Usuário mapeia colunas, locale, moeda, percentuais e separador decimal antes de persistir.
3. Preview diferencia linhas válidas e inválidas com erros reparáveis por campo.
4. Confirmação informa registros criados, atualizados e ignorados; repetir o lote não duplica totais.
5. Histórico mostra arquivo, hash, mapeamento, ator, contagens, horário e lineage de cada linha.

### Phase 105: Creative Hypotheses and Variant Comparison

**Goal:** Transformar números importados em experimentos interpretáveis sem fabricar causalidade ou vencedores.

**Depends on:** Phase 104

**Requirements:** HYPO-01, HYPO-02, HYPO-03, COMP-05, COMP-06, COMP-07, COMP-08

**Success Criteria:**
1. Usuário registra hipótese com uma variável principal, métrica, direção esperada e variantes participantes.
2. Comparações exibem métricas brutas/derivadas, amostra, período, contexto e diferença entre variantes.
3. Sistema exclui contextos incompatíveis e explica plataforma, período, objetivo ou vínculo que impediu a comparação.
4. Resultado usa explicitamente vencedor, sem vencedor claro, evidência insuficiente ou não comparável.
5. Interface distingue observação de mídia de hipótese controlada e registra se a hipótese foi suportada, contrariada ou inconclusiva.

### Phase 106: Client Performance Memory and Mem0

**Goal:** Consolidar padrões reutilizáveis por cliente e recuperar somente aprendizados relevantes, citados e sincronizados.

**Depends on:** Phase 105

**Requirements:** MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06

**Success Criteria:**
1. Sistema deriva aprendizados canônicos por CTA, formato, receita, estilo ou variável suportada com versão de algoritmo.
2. Cada aprendizado mostra evidências favoráveis e contraditórias, amostra, recência, contexto e confiança.
3. Aprendizado aprovado é projetado no Mem0 com workspace, cliente, ID canônico, versão e metadados pesquisáveis.
4. Recuperação contextual via Mem0 resolve a linha canônica no Postgres antes de exibir ou usar o aprendizado.
5. Correção ou remoção de evidência recalcula o aprendizado e atualiza/remove a projeção obsoleta sem bloquear o fluxo quando Mem0 estiver indisponível.

### Phase 107: Learning to Next Experiment

**Goal:** Converter memória de performance em uma próxima ação criativa explicável e controlada pelo usuário.

**Depends on:** Phase 106

**Requirements:** NEXT-01, NEXT-02, NEXT-03, NEXT-04

**Success Criteria:**
1. Campanha recebe recomendação contextual de próximo experimento baseada em aprendizados canônicos relevantes.
2. Recomendação mostra justificativa, evidências, contradições, amostra e confiança antes de qualquer ação.
3. Usuário pode aceitar, editar ou ignorar sem modificar automaticamente campanha, mídia ou orçamento.
4. Aceitar abre o fluxo existente com CTA, formato, receita ou estilo pré-preenchido e editável.
5. Eventos first-party registram visualização, aceite, edição e descarte para orientar a próxima iteração do produto.

### Phase 108: Performance Learning Release Gate

**Goal:** Provar que o ciclo importação → comparação → memória → próxima ação é seguro, reproduzível e utilizável em produção.

**Depends on:** Phase 107

**Requirements:** QA-10, QA-11, QA-12, QA-13

**Success Criteria:**
1. Testes cobrem entrada manual/CSV, locale, moeda, deduplicação, atualização de atribuição, auditoria e isolamento.
2. Testes cobrem comparabilidade, denominadores zero, contradições, evidência insuficiente e ausência de vencedor.
3. Testes cobrem criação, busca, atualização, remoção e falha não bloqueante da projeção Mem0.
4. Migração, `npm test`, `npm run lint` e `npm run build` passam no app.
5. UAT importa dados representativos, produz comparação explicável e abre um próximo experimento editável com evidência registrada.

---

### ✅ v12.0 Monetização Real (Phases 97-102) — SHIPPED 2026-06-11

**Milestone Goal:** Levar o billing Stripe existente a produção com lifecycle idempotente, dunning explícito, conversão beta→pago e superfícies de billing verificadas de ponta a ponta.

- [x] **Phase 97: Billing Contracts and Subscription Lifecycle** — status explícito, vínculo de subscription e grants idempotentes
- [x] **Phase 98: Past-Due Policy and Recovery** — política de spend, mensagens e portal para recuperação de pagamento
- [x] **Phase 99: In-Product Conversion Surfaces** — payload 402 estruturado e CTAs de trial/upgrade nos value moments
- [x] **Phase 100: Billing Account Experience** — datas, estados, histórico de grants e distinção beta/pago
- [x] **Phase 101: Stripe Production Go-Live** — checklist, deploy e smoke do webhook (LIVE-02 sign-off)
- [x] **Phase 102: Billing Regression and Release Gate** — testes de lifecycle/access e gate completo de qualidade

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 97 | Billing Contracts and Subscription Lifecycle | SUBS-01–03 | Complete | 2026-06-11 |
| 98 | Past-Due Policy and Recovery | DUEN-01–03 | Complete | 2026-06-11 |
| 99 | In-Product Conversion Surfaces | CONV-01–04 | Complete | 2026-06-11 |
| 100 | Billing Account Experience | BILL-01–04 | Complete | 2026-06-11 |
| 101 | Stripe Production Go-Live | LIVE-01–02 | Complete | 2026-06-11 |
| 102 | Billing Regression and Release Gate | QA-07–09 | Complete | 2026-06-11 |

Archive: [v12.0-ROADMAP.md](milestones/v12.0-ROADMAP.md) · [v12.0-REQUIREMENTS.md](milestones/v12.0-REQUIREMENTS.md) · [v12.0-MILESTONE-AUDIT.md](milestones/v12.0-MILESTONE-AUDIT.md)

---

### ✅ v11.11 Aprendizado → Ação (Phases 90-96) — SHIPPED 2026-06-11

**Milestone Goal:** Converter dados reais do beta (SESS-03) em melhorias acionáveis — tuning de readiness, redução de stall pós-preview e analytics/melhorias de share link self-serve.

- [x] **Phase 90: Analytics Foundation** — Allowlist extensions + aggregate functions for share, stall, and readiness override
- [x] **Phase 91: Share + Readiness Instrumentation** — `share_link_opened` server event, share open count, and override dimension dashboard
- [x] **Phase 92: Owner Dashboard: Stall + Timing** — Post-preview stall panel, median draft→share time, stall classification
- [x] **Phase 93: SESS-03 Operator UAT** — ≥3 real beta sessions documented (completed 2026-06-11)
- [x] **Phase 94: Learning Closure + Threshold Tune** — Q2/Q3/Q9 answered with real session citations; readiness thresholds adjusted with evidence (unblocked — Phase 93 complete) (completed 2026-06-11)
- [x] **Phase 95: Stall UX + Share Correlation** — "Continue → batch" nudge; share open rate by assistance level
- [x] **Phase 96: Regression Verification** — Tests for new events/aggregators/nudge; npm test + lint + build pass

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 90 | Analytics Foundation | READY-08, LEARN-06 | Complete | 2026-06-08 |
| 91 | Share + Readiness Instrumentation | SHARE-01, SHARE-02, READY-09 | Complete | 2026-06-08 |
| 92 | Owner Dashboard: Stall + Timing | STALL-01, STALL-02, DASH-07, DASH-08 | Complete | 2026-06-08 |
| 93 | SESS-03 Operator UAT | LEARN-05 | Complete | 2026-06-11 |
| 94 | Learning Closure + Threshold Tune | LEARN-04, READY-10 | Complete | 2026-06-11 |
| 95 | Stall UX + Share Correlation | STALL-03, SHARE-03 | Complete | 2026-06-08 |
| 96 | Regression Verification | QA-05, QA-06 | Complete | 2026-06-08 |

### ✅ v11.10 Fechamento Entrega e Analytics (Phases 85-89) — SHIPPED 2026-06-11

**Milestone Goal:** Fechar o cluster entrega/créditos/analytics com instrumentação cockpit restante, readiness false-positive override, owner dashboard polish, regressão verde e ≥3 sessões reais de operador com learning answers atualizados.

- [x] **Phase 85: Cockpit Instrumentation** — Recipe + briefing + preview funnel events
- [x] **Phase 86: Readiness Override** — False-positive override workflow + analytics
- [x] **Phase 87: Owner Dashboard Polish** — Timeline cap removal, credit funnel, session filter
- [x] **Phase 88: Regression Verification** — F-14 test fix + CI green gate
- [x] **Phase 89: SESS-03 Operator UAT** — ≥3 real sessions + learning answers updated (completed 2026-06-11)

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 85 | Cockpit Instrumentation | COCK-01, COCK-02, COCK-03, COCK-04, COCK-05 | Complete | 2026-06-07 |
| 86 | Readiness Override | READY-06, READY-07 | Complete | 2026-06-07 |
| 87 | Owner Dashboard Polish | DASH-04, DASH-05, DASH-06 | Complete | 2026-06-07 |
| 88 | Regression Verification | QA-03, QA-04 | Complete | 2026-06-07 |
| 89 | SESS-03 Operator UAT | SESS-03, SESS-05 | Complete | 2026-06-11 |

### ✅ v11.9 UX de Entrega e Créditos (Phases 80-84) — SHIPPED 2026-06-07

**Milestone Goal:** Users and owners understand credit cost before batch spend; delivery surfaces (approval package, share) are self-serve; owner analytics rank credit surprises and expose session stage gaps.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 80 | Credit Estimate Transparency | CRED-01, CRED-02, CRED-04 | Complete | 2026-06-07 |
| 81 | Credit Event Instrumentation | CRED-03 | Complete | 2026-06-07 |
| 82 | Delivery and Approval Package UX | DELIV-01, DELIV-02, DELIV-03 | Complete | 2026-06-07 |
| 83 | Owner Credit and Session Analytics | DASH-01, DASH-02, DASH-03 | Complete | 2026-06-07 |
| 84 | Regression Verification | QA-01, QA-02 | Complete | 2026-06-07 |

Archive: [v11.9-ROADMAP.md](milestones/v11.9-ROADMAP.md) · [v11.9-REQUIREMENTS.md](milestones/v11.9-REQUIREMENTS.md) · [v11.9-MILESTONE-AUDIT.md](milestones/v11.9-MILESTONE-AUDIT.md) · [v11.9-phases/](milestones/v11.9-phases/)

### ✅ v11.8 Loop de Aprendizado Beta (Phases 75-79) — SHIPPED 2026-06-07

**v11.8 Beta Learning Loop** — operator-run sessions, full instrumentation, owner funnel analytics, and evidence-driven friction fixes.

| # | Phase | Plans | Status | Completed |
|---|-------|-------|--------|-----------|
| 75 | Event Schema and Ingest Foundation | 3/3 | Complete | 2026-06-07 |
| 76 | Cockpit and Mission Instrumentation | 4/4 | Complete | 2026-06-07 |
| 77 | Operator Beta Sessions | 4/4 | Complete* | 2026-06-07 |
| 78 | Owner Analytics Dashboard and CSV | 4/4 | Complete | 2026-06-07 |
| 79 | Evidence-Driven Friction Fixes | 1/1 | Complete | 2026-06-07 |

\*SESS-03 operator UAT was completed on 2026-06-11 in Phases 89/93; learning closure completed in Phase 94.

Archive: [v11.8-ROADMAP.md](milestones/v11.8-ROADMAP.md) · [v11.8-REQUIREMENTS.md](milestones/v11.8-REQUIREMENTS.md) · [v11.8-phases/](milestones/v11.8-phases/)

### ✅ v11.7.1 Stabilization (Phases 72-74) — SHIPPED 2026-06-07

**v11.7.1 Stabilization** — beta-readiness hardening for the v11.7 progression loop.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 72 | Build and Data Integrity Hardening | Restore production build and make progression/insight persistence conflict-safe | STAB-01, STAB-02, DATA-01, DATA-02, DATA-03 | 5 ✅ |
| 73 | Mission Resume UX | Make mission/progression CTAs resume into the intended campaign workflow surface | UX-01, UX-02 | 4 ✅ |
| 74 | Migration, UAT, and Beta Handoff | Apply/verify progression migration and complete beta UAT evidence | STAB-03, STAB-04, UAT-01, UAT-02, UAT-03 | 5 ✅ |

**12 requirements** | **3 phases** | Stabilization-only scope before beta

## Phase Details

### Phase 90: Analytics Foundation

**Goal:** New event keys, property keys, and aggregate functions land atomically before any v11.11 instrumentation call site is written — schema contracts are the first delivery.

**Depends on:** Phase 89 (v11.10 allowlist pattern established; SESS-03 may run in parallel)

**Requirements:** READY-08, LEARN-06

**Success Criteria** (what must be TRUE):
  1. `share_link_opened` and `approval_package_refreshed` event keys are added to the beta analytics type allowlist (`types.ts`).
  2. Override event payload type includes `blockingDimensions: string[]` as an allowed property key — no call site can pass undeclared fields.
  3. Three new aggregate functions exist in `aggregate.ts`: share-link open aggregator, post-preview stall timing aggregator, and readiness override breakdown-by-dimension aggregator.
  4. No existing tests regress; type-checker confirms no undeclared event keys reach `recordBetaAnalyticsEvent`.

**Plans:** 3/3 plans complete

---

### Phase 91: Share + Readiness Instrumentation

**Goal:** Share link opens are captured server-side and owner can see per-campaign open counts and readiness override breakdown in the analytics dashboard.

**Depends on:** Phase 90 (allowlist extended; aggregators available)

**Requirements:** SHARE-01, SHARE-02, READY-09

**Success Criteria** (what must be TRUE):
  1. When a recipient opens a valid public share link (no auth), the server emits a `share_link_opened` event carrying `tokenId` and workspace context.
  2. Owner sees share link open counts per campaign in the analytics dashboard (`OwnerAnalyticsPanel` or equivalent).
  3. Owner sees a readiness override breakdown panel showing override count grouped by each `blockingDimension` ID.
  4. Focused tests prove the share-link open event fires on route hit and the override dimension aggregator returns correct grouped output.

**Plans:** TBD

**UI hint:** yes

---

### Phase 92: Owner Dashboard: Stall + Timing

**Goal:** Owner can observe post-preview stall patterns and draft-to-share timing from the analytics dashboard without manual data extraction.

**Depends on:** Phase 91 (stall timing aggregator from Phase 90 in place)

**Requirements:** STALL-01, STALL-02, DASH-07, DASH-08

**Success Criteria** (what must be TRUE):
  1. Owner sees median time between preview completion and batch start per session (F-07).
  2. Owner sees stall rate (sessions with >15 min gap) and classification of stall outcomes as stall→proceed vs stall→abandon (Q10).
  3. Owner sees a median draft→share time stat card, broken down by `assistance_level`, on the dashboard (D-4).
  4. Owner sees a dedicated post-preview stall panel listing campaigns currently in stall state (DASH-08).

**Plans:** TBD

**UI hint:** yes

---

### Phase 93: SESS-03 Operator UAT

**Goal:** Milestone proceeds to evidence-gated phases with ≥3 real beta sessions documented — this is the human gate that unlocks learning closure and threshold tuning.

**Depends on:** Phases 90–92 deployed to production and smoke-tested

**Requirements:** LEARN-05

**Success Criteria** (what must be TRUE):
  1. Operator completes ≥3 real beta sessions with documented session IDs stored in the session evidence file.
  2. Each session confirms that v11.11 instrumentation events (share_link_opened, stall timing, override dimensions) appear in the owner dashboard with real data.
  3. Session evidence records session IDs, event counts observed per session, and key behavioral findings.

**Plans:** TBD

---

### Phase 94: Learning Closure + Threshold Tune

**Goal:** Beta learning questions Q2/Q3/Q9 are answered with real session citations and readiness thresholds are adjusted with documented evidence — no fixture UUIDs remain.

**Depends on:** Phase 93 (≥3 real sessions completed)

**Requirements:** LEARN-04, READY-10

**Success Criteria** (what must be TRUE):
  1. Learning answers for Q2 (briefing skip), Q3 (readiness rerun), and Q9 (stale badge) are updated with citations to real session IDs — no `550e8400-…` fixture UUIDs remain.
  2. Readiness blocking/ready threshold constants are adjusted with a documented rationale citing override rate per dimension from ≥3 real sessions (D-1).
  3. Threshold change (or no-change decision) is committed with an evidence file noting the session IDs and override rates that drove the decision.

**Plans:** 2/2 plans complete

---

### Phase 95: Stall UX + Share Correlation

**Goal:** Stall-confirmed campaigns show an actionable nudge for operators, and owners can see share link engagement correlated with session assistance level.

**Depends on:** Phase 92 (stall confirmed across real sessions); Phase 91 (share opens flowing)

**Requirements:** STALL-03, SHARE-03

**Success Criteria** (what must be TRUE):
  1. When a campaign has an approved preview and batch is pending, the campaign card shows a "Continue → batch" indicator visible to the operator (D-2).
  2. Owner sees share link open rate correlated with `assistance_level` of the originating operator session (F-13, Q7, D-3).
  3. The nudge does not appear on campaigns where batch is already started or where preview is not yet approved.

**Plans:** TBD

**UI hint:** yes

---

### Phase 96: Regression Verification

**Goal:** All v11.11 changes ship with automated test coverage and a green CI gate before the milestone is declared complete.

**Depends on:** Phases 90–95

**Requirements:** QA-05, QA-06

**Success Criteria** (what must be TRUE):
  1. Tests cover the new event keys (`share_link_opened`, `approval_package_refreshed`), all three new aggregators, and the campaign stall nudge visibility logic.
  2. `npm test` passes with no failing or unexpectedly skipped tests.
  3. `npm run lint` and `npm run build` pass in `app/` with zero new errors introduced by the milestone.

**Plans:** TBD

---

### Phase 85: Cockpit Instrumentation

**Goal:** Owner can observe recipe selection, tradeoff engagement, and briefing step abandonment with accurate preview funnel data — no more false abandonment signals on recipe revise.

**Depends on:** Phase 84 (v11.9 regression baseline); v11.8 beta analytics foundation (types.ts allowlist pattern)

**Requirements:** COCK-01, COCK-02, COCK-03, COCK-04, COCK-05

**Success Criteria** (what must be TRUE):
  1. Owner sees `recipe_tradeoff_viewed` event in the analytics dashboard when an operator opens the tradeoff section of a recipe (F-08).
  2. Owner sees `recipe_selected` event carrying `recipeId` when an operator confirms a recipe selection (F-09).
  3. Owner sees a recipe selection funnel aggregated by `recipeId` showing how operators choose between recipes (COCK-03).
  4. Preview funnel no longer records a `cockpit_stage_abandoned` when the operator revises a recipe; `cockpit_stage_completed` only fires on genuine approval (F-06).
  5. Owner sees guided briefing abandonment broken down by `stepId` so per-step drop-off is visible (F-12).

**Plans:** TBD

**UI hint:** yes

---

### Phase 86: Readiness Override

**Goal:** Operators can declare a false-positive readiness block and continue the cockpit flow, with the override action generating an auditable event that owners see without inflated counts.

**Depends on:** Phase 85 (event allowlist extended)

**Requirements:** READY-06, READY-07

**Success Criteria** (what must be TRUE):
  1. Operator sees an override button on a blocked readiness screen and can continue the cockpit flow without resolving the flagged issue (F-11).
  2. The override action emits a `readiness_blocked { action: "overridden" }` event from the server-side preflight route, creating an auditable record.
  3. Owner sees readiness override signals in the analytics dashboard with accurate counts (no double-counting from both operator note and event).
  4. A single false-positive override is counted once; deduplication by `sessionId + stage + time window` prevents inflated metrics.

**Plans:** TBD

---

### Phase 87: Owner Dashboard Polish

**Goal:** Owner dashboard displays an uncapped session stage timeline, a credit consumption funnel by cockpit stage, and a session filter populated from real API data.

**Depends on:** Phase 85 (aggregateRecipeFunnel, aggregateCreditRevenueFunnel functions); Phase 82/83 v11.9 session timeline foundation

**Requirements:** DASH-04, DASH-05, DASH-06

**Success Criteria** (what must be TRUE):
  1. Session stage timeline renders all stages within the default date window with no 24-line hard cap truncation.
  2. Owner sees a "Créditos por Etapa" funnel showing credit spend mapped to cockpit stages (credit → preview → approval) without implying billing events.
  3. Session filter dropdown on the dashboard is populated with real session IDs fetched from `/api/feedback/sessions` — not empty or fixture data.

**Plans:** TBD

**UI hint:** yes

---

### Phase 88: Regression Verification

**Goal:** Test suite assertions match the current code contract and the full CI gate (test + lint + build) passes before SESS-03 operator sessions begin.

**Depends on:** Phases 85–87

**Requirements:** QA-03, QA-04

**Success Criteria** (what must be TRUE):
  1. `creative-quality-gate-orchestration` test assertions are aligned with the current output format — test passes without skips or `test.todo` workarounds (F-14).
  2. `npm test` passes with no failing or unexpectedly skipped tests.
  3. `npm run lint` and `npm run build` pass in `app/` with zero new errors introduced by the milestone.

**Plans:** TBD

---

### Phase 89: SESS-03 Operator UAT

**Goal:** Milestone closes with real operator session evidence — ≥3 documented sessions confirming instrumentation is live in production — and learning answers updated with real session IDs, not fixture UUIDs.

**Depends on:** Phases 85–88 deployed to production; Phase 88 CI green

**Requirements:** SESS-03, SESS-05

**Success Criteria** (what must be TRUE):
  1. Operator completes ≥3 real beta sessions with documented session IDs and runbook-stage artifacts stored in the session evidence file.
  2. Each session smoke-checks that cockpit events (recipe_tradeoff_viewed, recipe_selected, override) appear in the owner dashboard with real data.
  3. Learning answers for Q4 (recipe selection patterns), Q5 (preview funnel accuracy), Q6 (tradeoff readership), and the readiness override signal are updated with citations to real session IDs — no fixture UUIDs (`550e8400-…`) remain in the answers.
  4. Session evidence file records session IDs, event counts observed, and key behavioral findings from each session.

**Plans:** TBD

---

### Phase 80: Credit Estimate Transparency

**Goal:** Users see what credits will cost before batch derivation and understand prior spend at the preview gate.

**Depends on:** v11.8 (F-01 preview credit copy, batch gate foundation)

**Requirements:** CRED-01, CRED-02, CRED-04

**Success Criteria** (what must be TRUE):
  1. User sees an itemized credit estimate breakdown before confirming batch derivation.
  2. Preview gate shows credits already spent and a disclaimer that the estimate may differ from actual spend.
  3. When balance is insufficient for the batch estimate, the gate blocks with explicit estimate vs available balance.
  4. Blocked-state copy explains why the batch cannot proceed without operator intervention.

**Plans:** 2 plans (2 waves)

Plans:
- [x] 80-01-PLAN.md — Batch credit breakdown helper + billing balance wiring
- [x] 80-02-PLAN.md — PreviewGatePanel formula, balance, insufficient block + tests

**UI hint:** yes

### Phase 81: Credit Event Instrumentation

**Goal:** Credit spend and block events carry enough structure for owner surprise analytics.

**Depends on:** Phase 80

**Requirements:** CRED-03

**Success Criteria** (what must be TRUE):
  1. `credit_spend` events include `operation_key` identifying which operation consumed credits.
  2. `credit_blocked` events include `operation_key` and the estimate at block time.
  3. When actual spend differs from estimate, the delta is persisted on the spend event.
  4. Focused tests prove event payloads match the allowlist and include required credit fields.

**Plans:** TBD

### Phase 82: Delivery and Approval Package UX

**Goal:** Operators and clients can complete delivery (approval package, share) without hand-holding when assets are stale.

**Depends on:** v11.8 approval package foundation (Phase 64)

**Requirements:** DELIV-01, DELIV-02, DELIV-03

**Success Criteria** (what must be TRUE):
  1. Approval package displays a visible stale indicator when underlying assets are outdated.
  2. Stale indicator includes tooltip or inline copy with an actionable next step (e.g. refresh).
  3. Share link flow presents self-serve guidance so recipients know what to do without operator steps.
  4. After refresh, the UI communicates that assets were outdated and what was updated.

**Plans:** TBD

**UI hint:** yes

### Phase 83: Owner Credit and Session Analytics

**Goal:** Owner can diagnose credit surprises and post-preview stalls from the analytics dashboard.

**Depends on:** Phase 81 (operation_key on credit events); v11.8 owner dashboard (Phase 78)

**Requirements:** DASH-01, DASH-02, DASH-03

**Success Criteria** (what must be TRUE):
  1. Owner sees credit surprise ranked by operation on `OwnerAnalyticsPanel`.
  2. Owner sees a session timeline showing elapsed gaps between cockpit stages.
  3. CSV export includes per-operation credit surprise columns alongside existing funnel data.
  4. Non-owner users cannot access the new analytics surfaces (403 preserved).

**Plans:** TBD

**UI hint:** yes

### Phase 84: Regression Verification

**Goal:** Milestone ships with regression coverage and a green CI gate.

**Depends on:** Phases 80–83

**Requirements:** QA-01, QA-02

**Success Criteria** (what must be TRUE):
  1. Regression tests cover preview/batch credit copy, batch gate block behavior, and stale approval package states.
  2. `npm test`, `npm run lint`, and `npm run build` pass in `app/`.
  3. Verification artifact documents any accepted caveats from v11.8 post-ship items (SESS-03, migration 0033).

**Plans:** TBD

### Phase 72: Build and Data Integrity Hardening

**Goal:** Restore a clean production build and harden the v11.7 data boundaries found in review.

**Requirements:** STAB-01, STAB-02, DATA-01, DATA-02, DATA-03

**Success Criteria:**
1. `npm run build` passes without disabling Next.js TypeScript checks.
2. The missing `mission` feedback category handling is fixed where exhaustive category maps are used.
3. Mission insight sanitization rejects invalid `missionKey` values before recording feedback.
4. Progression snapshot persistence uses an atomic upsert or conflict-safe equivalent.
5. Focused tests cover invalid mission keys, progression persistence conflict behavior, and existing progression/missions/insights behavior.

**Depends on:** v11.7 review findings and current feedback/progression infrastructure.

### Phase 73: Mission Resume UX

**Goal:** Make activation CTAs keep their promise by landing users on the right workflow context.

**Requirements:** UX-01, UX-02

**Success Criteria:**
1. Campaign workspace consumes mission/progression resume targets or uses a route contract it already supports.
2. CTAs for assets, readiness, review, export, and share open the intended surface or state.
3. Default campaign workspace behavior is unchanged when no resume target is present.
4. Focused tests or browser smoke evidence prove the resume path for at least two representative mission CTAs.

**Depends on:** Phase 72 build health.

### Phase 74: Migration, UAT, and Beta Handoff

**Goal:** Prove the stabilized v11.7 loop is beta-ready in the target environment.

**Requirements:** STAB-03, STAB-04, UAT-01, UAT-02, UAT-03

**Success Criteria:**
1. Migration `0032_workspace_progression.sql` is applied and verified in the target environment.
2. UAT follows `.planning/phases/71-credit-activation-and-verification/71-UAT-EVIDENCE.md` from a fresh workspace.
3. Evidence covers build, migration, mission progress, insight capture, credit display, and owner triage.
4. Remaining caveats are documented explicitly as fixed, accepted, or deferred.
5. Handoff states whether v11.7.1 is beta-ready and what the next operator action is.

**Depends on:** Phases 72-73.

## Completed Milestone Context

<details>
<summary>✅ v11.8 Loop de Aprendizado Beta (Phases 75-79) - SHIPPED 2026-06-07</summary>

- [x] Phase 75: Event Schema and Ingest Foundation (3/3 plans)
- [x] Phase 76: Cockpit and Mission Instrumentation (4/4 plans)
- [x] Phase 77: Operator Beta Sessions (4/4 plans)
- [x] Phase 78: Owner Analytics Dashboard and CSV (4/4 plans)
- [x] Phase 79: Evidence-Driven Friction Fixes (1/1 plans)

Archive: [v11.8-ROADMAP.md](milestones/v11.8-ROADMAP.md) · [v11.8-REQUIREMENTS.md](milestones/v11.8-REQUIREMENTS.md) · [v11.8-MILESTONE-AUDIT.md](milestones/v11.8-MILESTONE-AUDIT.md) · [v11.8-phases/](milestones/v11.8-phases/)

</details>

<details>
<summary>✅ v11.7 Ads Scientist Progression (Phases 68-71) - SHIPPED 2026-06-06</summary>

- [x] Phase 68: Progression Foundation (2/2 plans)
- [x] Phase 69: Guided Mission Experience (2/2 plans)
- [x] Phase 70: Mission-Linked Insight Capture (2/2 plans)
- [x] Phase 71: Credit Activation and Verification (2/2 plans)

Archive context: phases 68-71 in `.planning/phases/`. Verification: `71-VERIFICATION.md`; UAT: `71-UAT-EVIDENCE.md`.

</details>

<details>
<summary>✅ v11.6.1 Ship Readiness and Beta Activation (Phases 66-67) - SHIPPED 2026-06-06</summary>

- [x] Phase 66: Production Smoke and Release Evidence (2/2 plans)
- [x] Phase 67: Milestone Archive and Beta Runbook (1/1 plans)

Archive context: `.planning/phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md` and `.planning/phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md`.

</details>

<details>
<summary>✅ v11.6 Creative Strategy Cockpit (Phases 61-65) - SHIPPED 2026-06-06</summary>

- [x] Phase 61: Creative Readiness Foundation (2/2 plans)
- [x] Phase 62: Guided Briefing Cockpit (2/2 plans)
- [x] Phase 63: Strategy Recipes and Preview Gate (2/2 plans)
- [x] Phase 64: Client Approval Package (2/2 plans)
- [x] Phase 65: Verification, Analytics, and Handoff (2/2 plans)

Archive: [v11.6-ROADMAP.md](milestones/v11.6-ROADMAP.md) · [v11.6-REQUIREMENTS.md](milestones/v11.6-REQUIREMENTS.md) · [v11.6-MILESTONE-AUDIT.md](milestones/v11.6-MILESTONE-AUDIT.md) · [v11.6-phases/](milestones/v11.6-phases/)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 103 | v12.1 | 3/3 | Complete | 2026-06-12 |
| 104 | v12.1 | 0/TBD | Not started | - |
| 105 | v12.1 | 0/TBD | Not started | - |
| 106 | v12.1 | 0/TBD | Not started | - |
| 107 | v12.1 | 0/TBD | Not started | - |
| 108 | v12.1 | 0/TBD | Not started | - |
| 97 | v12.0 | 1/1 | Complete | 2026-06-11 |
| 98 | v12.0 | 1/1 | Complete | 2026-06-11 |
| 99 | v12.0 | 1/1 | Complete | 2026-06-11 |
| 100 | v12.0 | 1/1 | Complete | 2026-06-11 |
| 101 | v12.0 | 1/1 | Complete | 2026-06-11 |
| 102 | v12.0 | 1/1 | Complete | 2026-06-11 |
| 90 | v11.11 | 1/1 | Complete | 2026-06-08 |
| 91 | v11.11 | 1/1 | Complete | 2026-06-08 |
| 92 | v11.11 | 1/1 | Complete | 2026-06-08 |
| 93 | v11.11 | 1/1 | Complete | 2026-06-11 |
| 94 | v11.11 | 3/3 | Complete | 2026-06-11 |
| 95 | v11.11 | 1/1 | Complete | 2026-06-08 |
| 96 | v11.11 | 1/1 | Complete | 2026-06-08 |
| 85 | v11.10 | 1/1 | Complete | 2026-06-07 |
| 86 | v11.10 | 1/1 | Complete | 2026-06-07 |
| 87 | v11.10 | 1/1 | Complete | 2026-06-07 |
| 88 | v11.10 | 1/1 | Complete | 2026-06-07 |
| 89 | v11.10 | 1/1 | Complete | 2026-06-11 |
| 80 | v11.9 | 0/TBD | Not started | - |
| 81 | v11.9 | 0/TBD | Not started | - |
| 82 | v11.9 | 0/TBD | Not started | - |
| 83 | v11.9 | 0/TBD | Not started | - |
| 84 | v11.9 | 0/TBD | Not started | - |
| 75 | v11.8 | 3/3 | Complete | 2026-06-07 |
| 76 | v11.8 | 4/4 | Complete | 2026-06-07 |
| 77 | v11.8 | 4/4 | Complete* | 2026-06-07 |
| 78 | v11.8 | 4/4 | Complete | 2026-06-07 |
| 79 | v11.8 | 1/1 | Complete | 2026-06-07 |
| 72 | v11.7.1 | 2/2 | Complete | 2026-06-07 |
| 73 | v11.7.1 | 1/1 | Complete | 2026-06-07 |
| 74 | v11.7.1 | 1/1 | Complete | 2026-06-07 |
| 68 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 69 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 70 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 71 | v11.7 | 2/2 | Complete | 2026-06-06 |
| 66 | v11.6.1 | 2/2 | Complete | 2026-06-06 |
| 67 | v11.6.1 | 1/1 | Complete | 2026-06-06 |
| 61 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 62 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 63 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 64 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 65 | v11.6 | 2/2 | Complete | 2026-06-05 |
| 57 | v11.5 | 2/2 | Complete | 2026-06-05 |
| 58 | v11.5 | 2/2 | Complete | 2026-06-05 |
| 59 | v11.5 | 4/4 | Complete | 2026-06-05 |
| 60 | v11.5 | 4/4 | Complete | 2026-06-05 |

---
*Roadmap updated: 2026-06-12 — v12.1 phases 103-108 proposed with 31/31 requirements mapped*
