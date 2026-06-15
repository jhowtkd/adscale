# Roadmap: ADScale

## Milestones

- 🚧 **v12.3 Integridade Criativa** - Phases 115-123 (in progress)
- ✅ **v12.2 Refinamento Visual e Consistência da Interface** - Phases 109-114 (shipped 2026-06-14)
- ✅ **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (shipped 2026-06-12)
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

### v12.3 Integridade Criativa (Phases 115-123) — IN PROGRESS

**Milestone Goal:** Impedir que o pipeline criativo aprove peças factualmente incorretas, visualmente genéricas ou hierarquicamente congestionadas — garantindo que regras críticas cheguem ao prompt, ao gate e aos testes.

**Audit baseline:** corpus `app/exports/render-creatives/` — 34 peças, média 58,5/100 (2026-06-15)

- [x] **Phase 115: Corpus Fixtures and Audit Baseline** — fixtures reproduzíveis para cada falha do corpus; campanhas canônicas; red tests provando aprovação indevida atual (completed 2026-06-15)
- [x] **Phase 116: Canonical Creative Contract** — contrato de ideia dominante, precedência fatos>hierarquia>decoração; injeção de `VISUAL_HIERARCHY_CONTRACT` e `ANTI_HALLUCINATION_RULES` (completed 2026-06-15)
- [x] **Phase 117: Factual vs Visual Separation** — classificação de inputs; referência visual só transfere linguagem abstrata; bloqueio de entidades inventadas (completed 2026-06-15)
- [x] **Phase 118: Per-Mode Prompt Rules** — regras distintas para `art_variation`, `restyling`, `format_adaptation`; orçamento de três zonas; mesma campanha em múltiplos formatos (completed 2026-06-15)
- [x] **Phase 119: Observable Rubric** — critérios observáveis substituem "polished"; reprova overload, genérico severo e hook ilegível em miniatura (completed 2026-06-15)
- [x] **Phase 120: Quality Gate Hardening** — novos hard failures; factual sempre invalid; corpus-falha bloqueado; fiel continua aprovável (completed 2026-06-15)
- [x] **Phase 121: Score Ceilings and Retry** — tetos por categoria de falha; retry de restyling da fonte factual; correções específicas (completed 2026-06-15)
- [x] **Phase 122: Regression Test Suite** — prompt injection tests; gate matrix; suíte por modo e formato; teste de miniatura (completed 2026-06-15)
- [ ] **Phase 123: Visual Validation Gate** — geração controlada antes/depois; rubrica ≥75/≥95; CI verde (4 plans; gaps_found on evidence)

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 115 | Corpus Fixtures and Audit Baseline | Complete    | 2026-06-15 | 2026-06-15 |
| 116 | Canonical Creative Contract | Complete    | 2026-06-15 | 2026-06-15 |
| 117 | Factual vs Visual Separation | Complete    | 2026-06-15 | 2026-06-15 |
| 118 | 0/4 | Complete    | 2026-06-15 | — |
| 119 | 0/4 | Complete    | 2026-06-15 | 2026-06-15 |
| 120 | Quality Gate Hardening | Complete    | 2026-06-15 | 2026-06-15 |
| 121 | Score Ceilings and Retry | Complete    | 2026-06-15 | 2026-06-15 |
| 122 | Regression Test Suite | Complete    | 2026-06-15 | — |
| 123 | Visual Validation Gate | 4/4 | gaps_found |  |

---

### ✅ v12.2 Refinamento Visual e Consistência da Interface (Phases 109-114) — SHIPPED 2026-06-14

**Milestone Goal:** Tornar toda a interface autenticada do ADScale compacta, profissional, previsível e estruturalmente responsiva, eliminando sobreposições e divergências sem alterar capacidades, regras ou contratos dos fluxos existentes.

**Audit:** [v12.2-MILESTONE-AUDIT.md](milestones/v12.2-MILESTONE-AUDIT.md) — `passed` (2026-06-14)

- [x] **Phase 109: Visual Foundations and Baseline** — inventário verificável, contratos visuais, geometria, densidade, camadas e ownership de rotas
- [x] **Phase 110: App Shell and Navigation** — shell responsivo, navegação e chrome global sem cortes, colisões ou ações inacessíveis
- [x] **Phase 111: Page Primitives and Operational Surfaces** — hierarquia, ações, toolbars, tabelas, formulários e estados compartilhados nas superfícies operacionais
- [x] **Phase 112: Campaign Workspace and Overlays** — workspace orientado por etapa, dados densos e overlays previsíveis em qualquer viewport
- [x] **Phase 113: Dashboard and Secondary Surface Consistency** — dashboard, biblioteca, templates/restyling, feedback e configurações alinhados em responsividade, acessibilidade e localização
- [x] **Phase 114: Visual Regression and Release Gate** — matriz de navegador, regressão focada, acessibilidade e gate completo de release

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 109 | Visual Foundations and Baseline | FOUND-01–05, QA-14 | Complete | 2026-06-13 |
| 110 | App Shell and Navigation | SHELL-01–05 | Complete | 2026-06-13 |
| 111 | Page Primitives and Operational Surfaces | SURF-01–05 | Complete | [111-SUMMARY](phases/111-page-primitives-and-operational-surfaces/111-SUMMARY.md) |
| 112 | Campaign Workspace and Overlays | WORK-01–05 | Complete | [112-SUMMARY](phases/112-campaign-workspace-and-overlays/112-SUMMARY.md) |
| 113 | Dashboard and Secondary Surfaces | SURF-06, RESP-06/08/09, A11Y-06–09 | Complete | [113-SUMMARY](phases/113-dashboard-and-secondary-surfaces/113-SUMMARY.md) |
| 114 | Visual Regression and Release Gate | RESP-07, QA-15–17 | Complete | 2026-06-14 |

Archive: [v12.2-ROADMAP.md](milestones/v12.2-ROADMAP.md) · [v12.2-REQUIREMENTS.md](milestones/v12.2-REQUIREMENTS.md) · [v12.2-MILESTONE-AUDIT.md](milestones/v12.2-MILESTONE-AUDIT.md)

---

### ✅ v12.1 Memória Criativa e Aprendizado de Performance (Phases 103-108) — SHIPPED 2026-06-12

**Milestone Goal:** Associar hipóteses e derivações a resultados reais de mídia, consolidar aprendizados auditáveis por cliente no Postgres e recuperá-los via Mem0 para recomendar o próximo experimento com evidência e confiança explícitas.

- [x] **Phase 103: Performance Data Foundation** — contratos canônicos, migrações, métricas derivadas, lineage e isolamento
- [x] **Phase 104: Manual and CSV Result Import** — entrada manual, mapeamento, preview, normalização, deduplicação e histórico
- [x] **Phase 105: Creative Hypotheses and Variant Comparison** — hipóteses, comparabilidade e estados honestos de evidência
- [x] **Phase 106: Client Performance Memory and Mem0** — aprendizados canônicos, contradições e projeção semântica sincronizada
- [x] **Phase 107: Learning to Next Experiment** — recomendação explicável e prefill editável no cockpit existente
- [x] **Phase 108: Performance Learning Release Gate** — regressão, migração prod (0036–0040), build e UAT product-pure

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 103 | Performance Data Foundation | PERF-13–16 | Complete | 2026-06-12 |
| 104 | Manual and CSV Result Import | IMPT-01–06 | Complete | 2026-06-12 |
| 105 | Creative Hypotheses and Variant Comparison | HYPO-01–03, COMP-05–08 | Complete | 2026-06-12 |
| 106 | Client Performance Memory and Mem0 | MEM-01–06 | Complete | 2026-06-12 |
| 107 | Learning to Next Experiment | NEXT-01–04 | Complete | 2026-06-12 |
| 108 | Performance Learning Release Gate | QA-10–13 | Complete | 2026-06-12 |

Archive: [v12.1-ROADMAP.md](milestones/v12.1-ROADMAP.md) · [v12.1-REQUIREMENTS.md](milestones/v12.1-REQUIREMENTS.md) · [v12.1-MILESTONE-AUDIT.md](milestones/v12.1-MILESTONE-AUDIT.md)

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

### Phase 115: Corpus Fixtures and Audit Baseline

**Goal:** Operadores e testes podem reproduzir cada falha crítica do corpus auditado antes de qualquer correção do pipeline.

**Depends on:** Phase 114 (v12.2 shipped baseline)

**Requirements:** FIXT-01, FIXT-02, FIXT-03, FIXT-04

**Success Criteria** (what must be TRUE):
  1. Cada falha observada no corpus (entidade inventada, overload, template genérico, drift de formato, contaminação de restyling) possui fixture reproduzível no catálogo `quality-fixtures` ou equivalente.
  2. Fixtures registram campanha canônica, entidades permitidas, modos e formatos para Smoke, Nova campanha, Teste 3/CENBRAP NR1 e Teste campanha/Master NR1.
  3. Previews (`270×270`) e finais são categorias distintas nas fixtures e na validação — não misturadas na mesma expectativa de gate.
  4. Testes automatizados demonstram que o pipeline atual aprova indevidamente as peças-falha do corpus (baseline red antes da correção).

**Plans:** 3/3 plans complete

Plans:
- [x] 115-01-PLAN.md — Canonical campaign registry + manifest index (FIXT-02, FIXT-03)
- [x] 115-02-PLAN.md — Audit archetype fixtures (FIXT-01)
- [x] 115-03-PLAN.md — Red baseline gate tests (FIXT-04)

---

### Phase 116: Canonical Creative Contract

**Goal:** Toda derivação parte de um contrato canônico que declara ideia dominante, hierarquia de três zonas e precedência factual sem contradições no prompt.

**Depends on:** Phase 115

**Requirements:** CONT-01, CONT-02, CONT-03, CONT-04

**Success Criteria** (what must be TRUE):
  1. Contrato declara ideia dominante, hook único, zona de prova/oferta, CTA único e identidade invariável (campanha, paleta, pessoas, produto, marca).
  2. Contrato distingue conteúdo obrigatório, condensável e decorativo com precedência explícita: fatos > hierarquia > decoração.
  3. Nenhum prompt exige simultaneamente preservar todos os módulos literalmente e simplificar hierarquia sem regra de precedência.
  4. `VISUAL_HIERARCHY_CONTRACT` e `ANTI_HALLUCINATION_RULES` aparecem em todos os prompts de derivação aplicáveis.

**Plans:** 3/3 plans complete

Plans:
- [x] 116-01-PLAN.md — Canonical types, resolver, job wiring (CONT-01, CONT-02)
- [x] 116-02-PLAN.md — Integrity injection + extractors + regression tests (CONT-04)
- [x] 116-03-PLAN.md — Tier-aware mode blocks + preserve-all conflict resolution (CONT-03)

---

### Phase 117: Factual vs Visual Separation

**Goal:** Restyling e adaptações subsequentes não herdam pessoas, marcas ou alegações da referência visual — apenas atributos abstratos de estilo.

**Depends on:** Phase 116

**Requirements:** SEP-01, SEP-02, SEP-03, SEP-04

**Success Criteria** (what must be TRUE):
  1. Inputs são classificados explicitamente: base factual, referência visual, brand kit e referências adicionais.
  2. Referência visual transfere apenas ritmo, textura, cromia, tipografia, iluminação e lógica compositiva — nunca pessoas, uniformes, produtos, marcas, logos, textos ou alegações.
  3. Derivação contaminada não pode servir como fonte para adaptações de formato subsequentes.
  4. Entidades como Cantona, Manchester United e Adidas ausentes da fonte factual são bloqueadas no gate.

**Plans:** 4/4 plans complete

Plans:
- [x] 117-01-PLAN.md — Input source classification module + prompt/job wiring (SEP-01)
- [x] 117-02-PLAN.md — Visual reference transfer allowlist + visualTokenBrief guard (SEP-02)
- [x] 117-03-PLAN.md — Contaminated lineage firewall for format adaptation (SEP-03)
- [x] 117-04-PLAN.md — Allowed entities registry + invented_factual_entity gate (SEP-04)

---

### Phase 118: Per-Mode Prompt Rules

**Goal:** Cada modo de derivação aplica regras distintas que impedem variação decorativa, contaminação de restyling e adaptações que viram outra campanha.

**Depends on:** Phase 117

**Requirements:** MODE-01, MODE-02, MODE-03, MODE-04, MODE-05

**Success Criteria** (what must be TRUE):
  1. `art_variation` exige ideia ou mecanismo visual novo e reprova variação meramente decorativa (cor, glow, fundo, reposição de cards).
  2. `art_variation` limita o orçamento visual a no máximo três zonas principais de informação.
  3. `restyling` preserva integralmente entidades da base factual e extrai apenas atributos abstratos da referência visual.
  4. `format_adaptation` trata saída como edição da mesma campanha — preserva pessoas, copy, CTA, marca e conceito; altera apenas composição, escala e agrupamento.
  5. A mesma campanha permanece reconhecível em `1:1`, `4:5` e `9:16` sem introduzir nova narrativa.

**Plans:** 4/4 plans complete

Plans:
- [ ] 118-01-PLAN.md — Scaffold per-mode-prompt-rules.ts + art_variation pack (MODE-01/02)
- [ ] 118-02-PLAN.md — Restyling MODE pack consolidation (MODE-03)
- [ ] 118-03-PLAN.md — Format adaptation pack + flexible-context firewall (MODE-04/05)
- [ ] 118-04-PLAN.md — Regression snapshots + integration verification

---

### Phase 119: Observable Rubric

**Goal:** Avaliação reprova peças congestionadas, genéricas ou com hook ilegível em miniatura — com defeitos explicados por elementos visíveis, não adjetivos vagos.

**Depends on:** Phase 118

**Requirements:** RUBR-01, RUBR-02, RUBR-03, RUBR-04

**Success Criteria** (what must be TRUE):
  1. Avaliação reprova quando não há ponto focal dominante, existem mais de três zonas concorrentes ou múltiplos CTAs competem com o hook.
  2. Avaliação reprova estética template genérica severa (neon/glow/cards premium sem justificativa de marca ou campanha).
  3. Defeitos são explicados por elementos visíveis observáveis — termos como "polished" ou "professional" não são critério de aprovação isolado.
  4. Hook é compreensível em miniatura (escala de preview/mobile).

**Plans:** 4/4 plans complete

Plans:
- [x] 119-01-PLAN.md — Observable rubric module scaffold (RUBR-01–04)
- [x] 119-02-PLAN.md — Wire rubric into QA prompt; remove export-softening (RUBR-01–04)
- [x] 119-03-PLAN.md — Extract buildCreativeScorePrompt; score rubric parity (RUBR-01–04)
- [x] 119-04-PLAN.md — Corpus archetype regression + baseline gap verification (RUBR-01–04)

---

### Phase 120: Quality Gate Hardening

**Goal:** Peças factualmente incorretas ou esteticamente genéricas severas não passam para exportação — independentemente da nota estética.

**Depends on:** Phase 119

**Requirements:** GATE-01, GATE-02, GATE-03, GATE-04, GATE-05

**Success Criteria** (what must be TRUE):
  1. Novas categorias bloqueantes estão ativas: `invented_factual_entity`, `replaced_source_subject`, `unauthorized_brand_or_ip`, `campaign_identity_drift`, `style_reference_contamination`, `generic_template_aesthetic`, `visual_overload`, `missing_dominant_idea`, `decorative_only_variation`.
  2. Falha factual produz `invalid` independentemente da nota estética.
  3. Estética genérica severa bloqueia exportação quando acima do threshold — não fica apenas em `polishSuggestions`.
  4. Peças `27069645`, `a753e357`, `538246da`, `a5f65b85`, `f420bcb2`, `d7d9d323` do corpus são bloqueadas após correção.
  5. Peça fiel como `c2c12774` continua aprovável (pode receber sugestões de simplificação, não invalidação factual).

**Plans:** 3/3 plans complete

Plans:
- [x] 120-01-PLAN.md — Taxonomy, type union, normalizeHardFailureCode, i18n (GATE-01)
- [x] 120-02-PLAN.md — Classifier refactor + CONTAMINATION_FAILURE_CODES (GATE-01–03)
- [x] 120-03-PLAN.md — Corpus alignment, faithful c2c12774 fixture, baseline flip (GATE-04–05)

---

### Phase 121: Score Ceilings and Retry

**Goal:** Nota alta não mascara falhas factuais; retry de restyling sempre parte da fonte factual original com correção específica ao defeito.

**Depends on:** Phase 120

**Requirements:** SCR-01, SCR-02, SCR-03, SCR-04, SCR-05

**Success Criteria** (what must be TRUE):
  1. Score separa integridade factual, hierarquia, legibilidade, direção de arte, originalidade e adequação ao formato.
  2. Tetos de nota aplicados: fato inventado ≤20, campanha substituída ≤15, CTA ausente ≤50, overload grave ≤55, variação decorativa ≤60.
  3. Nota alta não coexiste com hard failures ativos.
  4. Retry habilitado para restyling usa fonte factual original, nunca saída contaminada.
  5. Correção de retry é específica: remover entidade inventada, restaurar pessoa/marca, reduzir módulos, restaurar conceito/CTA.

**Plans:** 3/3 plans complete

Plans:
- [x] 121-01-PLAN.md — Score ceilings (SCR-02/03), gate persist, SCR-01 dimension map
- [x] 121-03-PLAN.md — Failure-specific correction directives + restyling factual-source rule (SCR-05)
- [x] 121-02-PLAN.md — Mode-aware retry policy, restyling job wiring, two-image auto-retry (SCR-04)

---

### Phase 122: Regression Test Suite

**Goal:** Suíte automatizada detecta regras declaradas mas não aplicadas — em prompts, gate e por modo — antes que falhas cheguem ao operador.

**Depends on:** Phase 121

**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04

**Success Criteria** (what must be TRUE):
  1. Testes de prompt verificam presença de ideia dominante, três níveis, CTA secundário, entidades proibidas, separação factual/visual e simplificação permitida.
  2. Testes de gate cobrem Cantona/Manchester United, pessoa substituída, logo não autorizado, campanha diferente, template genérico, excesso de módulos e variação decorativa.
  3. Suíte independente por modo (`art_variation`, `restyling`, `format_adaptation`) com mesmas entradas em múltiplos formatos.
  4. Teste de miniatura valida leitura do hook em escala mobile.

**Plans:** 4/4 plans complete

---

### Phase 123: Visual Validation Gate

**Goal:** Milestone fecha com evidência visual controlada de que o pipeline corrigido atinge metas de qualidade e fidelidade factual antes do release.

**Depends on:** Phases 115–122

**Requirements:** QA-18, QA-19, QA-20, QA-21

**Success Criteria** (what must be TRUE):
  1. Geração controlada antes/depois com mesma campanha e seed (quando suportado) para cada modo em formatos representativos.
  2. Rubrica de 12 critérios aplicada ao conjunto pós-correção atinge média geral ≥75 e fidelidade factual ≥95.
  3. Nenhuma entidade inventada e nenhuma campanha substituída no conjunto de validação.
  4. `npm test`, `npm run lint` e `npm run build` passam com cobertura de regressão do milestone.

**Plans:** 4 plans

Plans:
- [x] 123-01-PLAN.md — Validation matrix (6 cells, all modes) + matrix unit tests
- [x] 123-02-PLAN.md — Threshold aggregation + evidence check (--stage before + after; before fixture)
- [x] 123-03-PLAN.md — Operator capture script + base assets + live evidence (checkpoint; tasks 01–02 done)
- [x] 123-04-PLAN.md — Release gate orchestrator + final evidence validation + milestone closure (gaps_found: operator refresh required)

---

### Phase 109: Visual Foundations and Baseline

**Goal:** Usuários encontram uma linguagem visual única e previsível, sustentada por contratos verificáveis de rota, geometria, densidade, camadas e estados antes da migração ampla das superfícies.

**Depends on:** Phase 108 (v12.1 shipped baseline)

**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, QA-14

**Success Criteria** (what must be TRUE):
  1. Usuário encontra cores, superfícies, bordas, tipografia, espaçamento e estados semânticos coerentes em componentes equivalentes nos modos light e dark.
  2. Usuário percebe gutters, larguras, densidade e hierarquia tipográfica previsíveis ao alternar entre rotas autenticadas, sem mudanças arbitrárias de alinhamento.
  3. Conteúdo, regiões sticky, navegação e overlays obedecem uma ordem de camadas única, sem elementos locais competindo por sobreposição.
  4. Cada rota autenticada e família compartilhada possui exatamente uma phase de implementação e ao menos um cenário definido para o browser release gate.

**Plans:** 6/6 plans executed

Plans:
- [x] 109-01-PLAN.md — Execution guardrails and immutable dirty-state snapshot
- [x] 109-02-PLAN.md — Ownership inventory and deterministic pre-change baseline
- [x] 109-03-PLAN.md — Canonical visual foundation contract
- [x] 109-04-PLAN.md — Basic controls and data-state primitives
- [x] 109-05-PLAN.md — Overlay primitives and layer behavior
- [x] 109-06-PLAN.md — Browser proof and validation closure

---

### Phase 110: App Shell and Navigation

**Goal:** Usuários navegam por um frame autenticado estável que reorganiza identidade, contexto e ações sem ocultar conteúdo do mobile ao ultrawide.

**Depends on:** Phase 109

**Requirements:** SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05

**Success Criteria** (what must be TRUE):
  1. Sidebar, top bar e navegação mobile nunca cobrem conteúdo ou ações e respeitam safe areas, zoom e teclado.
  2. Identidade, localização atual, busca, notificações, conta e ações globais se reorganizam em larguras intermediárias sem corte ou colisão.
  3. Todas as rotas autenticadas iniciam no mesmo frame de página, com largura, gutters e offsets previsíveis.
  4. Navegação ativa, foco, menus e controles globais permanecem compreensíveis e operáveis com mouse, toque e teclado em PT-BR e EN.

**Plans:** TBD

---

### Phase 111: Page Primitives and Operational Surfaces

**Goal:** Usuários reconhecem a mesma hierarquia de página, prioridade de ações e comportamento de dados e estados nas superfícies operacionais do produto.

**Depends on:** Phase 110

**Requirements:** SURF-01, SURF-02, SURF-03, SURF-04, SURF-05

**Success Criteria** (what must be TRUE):
  1. Títulos, descrições, ações primárias, ações secundárias e seções seguem uma hierarquia reconhecível em campanhas, configurações e demais rotas operacionais.
  2. Usuário vê menos containers redundantes, mantendo contexto, agrupamento e escaneabilidade dos dados existentes.
  3. A ação principal de cada região é inequívoca; ações secundárias e destrutivas permanecem acessíveis, subordinadas e confirmadas quando necessário.
  4. Toolbars, tabelas, filtros, formulários e abas adotam alternativas estruturais utilizáveis em telas estreitas sem remover capacidades.
  5. Loading, vazio, busca sem resultado, erro e sucesso preservam a geometria da tarefa e oferecem orientação ou recuperação consistente.

**Plans:** Complete — see [111-SUMMARY.md](phases/111-page-primitives-and-operational-surfaces/111-SUMMARY.md)

---

### Phase 112: Campaign Workspace and Overlays

**Goal:** Usuários percorrem briefing, upload, geração, revisão, entrega e performance com orientação contínua, dados operacionais preservados e overlays que não interrompem o contexto.

**Depends on:** Phase 111

**Requirements:** WORK-01, WORK-02, WORK-03, WORK-04, WORK-05

**Success Criteria** (what must be TRUE):
  1. A etapa atual, o status e a próxima ação do workspace permanecem claros em todos os estados do fluxo de campanha.
  2. Barras sticky, painéis, galerias, sidebars e rodapés não ocultam conteúdo nem ações em qualquer viewport suportado.
  3. Dialogs, sheets e popovers mantêm foco, scroll, fechamento por teclado e retorno ao acionador correto, inclusive em combinações suportadas.
  4. Status, metadados e dados densos continuam disponíveis por hierarquia ou progressive disclosure, sem perda de informação operacional.
  5. Upload, briefing, geração, revisão, aprovação, entrega e performance preservam as mesmas regras, permissões e resultados de produto após o refinamento visual.

**Plans:** Complete — see [112-SUMMARY.md](phases/112-campaign-workspace-and-overlays/112-SUMMARY.md)

---

### Phase 113: Dashboard and Secondary Surface Consistency

**Goal:** Usuários encontram dashboard, biblioteca, templates/restyling, feedback e configurações como partes do mesmo produto, com estruturas responsivas, acessíveis e resilientes a tema e idioma.

**Depends on:** Phase 112

**Requirements:** SURF-06, RESP-06, RESP-08, RESP-09, A11Y-06, A11Y-07, A11Y-08, A11Y-09

**Success Criteria** (what must be TRUE):
  1. Dashboard, biblioteca, templates/restyling, feedback e configurações compartilham linguagem visual, densidade, estados e prioridade de ações sem perder suas funções específicas.
  2. Nenhuma rota autenticada apresenta scroll horizontal acidental, corte, colisão ou sobreposição; galerias e dados usam o ultrawide sem alongar leitura e formulários indefinidamente.
  3. Controles e ações permanecem operáveis por toque, mouse e teclado, com foco visível, ordem coerente e retorno de foco correto.
  4. Seleção, erro, alerta e sucesso mantêm contraste e significado sem depender apenas de cor nos modos light e dark.
  5. PT-BR e EN suportam textos longos, números, datas e labels sem quebrar a estrutura ou ocultar informação crítica.

**Plans:** Complete — see [113-SUMMARY.md](phases/113-dashboard-and-secondary-surfaces/113-SUMMARY.md)

---

### Phase 114: Visual Regression and Release Gate

**Goal:** O milestone fecha somente com evidência reproduzível de consistência visual, responsividade, acessibilidade e preservação dos fluxos críticos.

**Depends on:** Phases 109-113

**Requirements:** RESP-07, QA-15, QA-16, QA-17

**Success Criteria** (what must be TRUE):
  1. Rotas e estados representativos passam em 390, 768, 1024, 1280, 1440 e 1920 pixels, com evidência de ausência de corte, colisão e sobreposição.
  2. A matriz de navegador cobre dados densos, vazio, loading, erro, conteúdo longo e combinações críticas de overlays em temas e idiomas representativos.
  3. Regressões visuais ou responsivas com lógica reproduzível possuem testes focados que falham quando o defeito retorna.
  4. Auditoria de acessibilidade, UAT visual, `npm test`, `npm run lint` e `npm run build` passam antes do release, com exceções explicitamente documentadas.

**Plans:** Complete — see [114-SUMMARY.md](phases/114-visual-regression-and-release-gate/114-SUMMARY.md)

---

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
| 115 | v12.3 | 0/TBD | Not started | - |
| 116 | v12.3 | 0/TBD | Not started | - |
| 117 | v12.3 | 0/TBD | Not started | - |
| 118 | v12.3 | 0/TBD | Not started | - |
| 119 | v12.3 | 0/TBD | Not started | - |
| 120 | v12.3 | 0/TBD | Not started | - |
| 121 | v12.3 | 0/TBD | Not started | - |
| 122 | v12.3 | 0/TBD | Not started | - |
| 123 | v12.3 | 0/TBD | Not started | - |
| 109 | v12.2 | 6/6 | Complete | 2026-06-13 |
| 110 | v12.2 | 0/TBD | Not started | - |
| 111 | v12.2 | 0/TBD | Not started | - |
| 112 | v12.2 | 0/TBD | Not started | - |
| 113 | v12.2 | 0/TBD | Not started | - |
| 114 | v12.2 | 0/TBD | Not started | - |
| 103 | v12.1 | 3/3 | Complete | 2026-06-12 |
| 104 | v12.1 | 0/TBD | Not started | - |
| 105 | v12.1 | 0/TBD | Not started | - |
| 106 | v12.1 | 0/TBD | Not started | - |
| 107 | v12.1 | 1/1 | Complete | 2026-06-12 |
| 108 | v12.1 | 1/1 | Complete (UAT pending) | 2026-06-12 |
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
*Roadmap updated: 2026-06-15 — v12.3 phases 115-123 created with 37/37 requirements mapped*
