# Roadmap: ADScale

## Milestones

- 🚧 **v12.9 Fechamento Humano do Olhar Cenbrap** - Phases 147-150 (active; started 2026-06-19)
- ✅ **v12.8 Operacao Real do Olhar Cenbrap** - Phases 143-146 (shipped 2026-06-19; tech debt: Jhonatan decisions pending, sample 0/5, synthetic_fixture corpus)
- ✅ **v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance** - Phases 138-142 (shipped 2026-06-19; tech debt partially closed by v12.8)
- ✅ **v12.6 Operacao Live do Corpus de Qualidade** - Phases 134-137 (shipped 2026-06-18; tech debt: empty live corpus, template 135/136 fallbacks)
- ✅ **v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo** - Phases 129-133 (shipped 2026-06-17; tech debt: empty live corpus)
- ✅ **v12.4 Aprendizado de Qualidade dos Outputs** - Phases 124-128 (shipped 2026-06-17)
- ✅ **v12.3 Integridade Criativa** - Phases 115-123 (shipped 2026-06-16; QA-19 accepted gap)
- ✅ **v12.2 Refinamento Visual e Consistência da Interface** - Phases 109-114 (shipped 2026-06-14)
- ✅ **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (shipped 2026-06-12)
- ✅ **v12.0 Monetização Real** - Phases 97-102 (shipped 2026-06-11)

## Phases

### 🚧 v12.9 Fechamento Humano do Olhar Cenbrap (Phases 147-150) — ACTIVE

**Milestone Goal:** Transformar o gate honesto de v12.8 em calibracao humana real: decisoes do Jhonatan, amostra minima, corpus customer-real quando disponivel e claims de acordo/qualidade somente quando a evidencia permitir.

**Starting point:** v12.8 fechou como `tech_debt`; `142-EVIDENCE.json` live e checker passam com `human_needed`, mas `humanDecisionCount=0`, `missingHumanDecisionCount=2`, sample guidance `0/5`, `agreementRate=null` e corpus `synthetic_fixture`.

- [x] **Phase 147: Operator Decision Session and Calibration Rerun** — capturar decisoes do Jhonatan nas linhas atuais, persistir eventos e rerodar calibracao sem inferir julgamento humano. (completed 2026-06-19)
- [ ] **Phase 148: Sample Sufficiency Expansion** — chegar a 5 decisoes humanas ou registrar blocker exato; preservar claims withheld enquanto a amostra nao fecha.
- [ ] **Phase 149: Customer-Real Cenbrap Corpus Replacement** — localizar/importar rows customer-real ou documentar `operator_data_unavailable`, separando fixture de prova real.
- [ ] **Phase 150: Agreement Calibration and Final Claims Gate** — auditar mismatches, aplicar ajustes pequenos se provados, refrescar evidencia e fechar/carry-forward de v12.9.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 147 | Operator Decision Session and Calibration Rerun | Complete    | 2026-06-19 | 2026-06-19 |
| 148 | Sample Sufficiency Expansion | SAMPLE-01..04 | Pending | — |
| 149 | Customer-Real Cenbrap Corpus Replacement | REALCORP-01..04 | Pending | — |
| 150 | Agreement Calibration and Final Claims Gate | AGREE-01..04 | Pending | — |

## Phase Details

### Phase 147: Operator Decision Session and Calibration Rerun

**Goal:** Capturar ou bloquear explicitamente as decisoes do Jhonatan para as linhas `review_ready`, persistir com seguranca e rerodar a calibracao para trocar `missing_human_decision` por metricas comparaveis.

**Depends on:** v12.8 Phase 146 claims gate

**Requirements:** HUMDEC-01, HUMDEC-02, HUMDEC-03, HUMDEC-04

**Success Criteria** (what must be TRUE):
  1. `145-DECISIONS.json` ou artifact equivalente registra decisao humana para cada linha atual `review_ready`, ou deixa cada ausencia como `manual_pending`.
  2. `record-cenbrap-calibration-decisions.ts --confirm` grava decisoes idempotentes com reviewer/reviewedAt e sem payload sensivel.
  3. Rerun da calibracao atualiza `humanDecisionCount`, `missingHumanDecisionCount`, `comparableCount` e mismatch reason counts.
  4. Evidence/verification nao infere decisao humana a partir de `olharVerdict` ou `exportStatus`.

**Plans:** 2/2 plans complete

Plans:
- [x] 147-01-PLAN.md — Decision artifact completion and safe event recording
- [x] 147-02-PLAN.md — Calibration rerun, evidence refresh and human-needed audit

---

### Phase 148: Sample Sufficiency Expansion

**Goal:** Atingir a amostra minima de 5 decisoes humanas para liberar metricas de acordo, ou documentar exatamente por que a amostra ainda esta indisponivel.

**Depends on:** Phase 147

**Requirements:** SAMPLE-01, SAMPLE-02, SAMPLE-03, SAMPLE-04

**Success Criteria** (what must be TRUE):
  1. Existem pelo menos 5 linhas revisaveis com decisao humana, ou blocker operacional explicito para rows faltantes.
  2. Evidence mantem `agreementRate=null` enquanto `additionalNeeded > 0`.
  3. Quando `additionalNeeded=0`, agreement/mismatch usa apenas linhas comparaveis.
  4. Source composition aparece na evidencia e no audit.

**Plans:** 0/2 plans complete

Plans:
- [ ] 148-01-PLAN.md — Reviewable-row sourcing and sample expansion
- [ ] 148-02-PLAN.md — Sample-guidance rerun and claim-state update

---

### Phase 149: Customer-Real Cenbrap Corpus Replacement

**Goal:** Substituir ou complementar `synthetic_fixture` com derivacoes customer-real Cenbrap, ou fechar o blocker `operator_data_unavailable` sem contaminar claims.

**Depends on:** Phase 148

**Requirements:** REALCORP-01, REALCORP-02, REALCORP-03, REALCORP-04

**Success Criteria** (what must be TRUE):
  1. Ambientes configurados sao inspecionados sem vazar secrets.
  2. Rows customer-real elegiveis entram no contact sheet com safe refs e dual verdicts, ou blocker typed e documentado.
  3. Evidence separa fixture operacional de prova customer-real.
  4. Claims externos so usam rows elegiveis para o tipo de prova declarado.

**Plans:** 0/2 plans complete

Plans:
- [ ] 149-01-PLAN.md — Safe customer-real corpus discovery
- [ ] 149-02-PLAN.md — Customer-real contact sheet and evidence source split

---

### Phase 150: Agreement Calibration and Final Claims Gate

**Goal:** Converter decisoes humanas em aprendizado operacional do Olhar, atualizar evidencia final e fechar v12.9 com claims permitidos/proibidos explicitamente.

**Depends on:** Phase 149

**Requirements:** AGREE-01, AGREE-02, AGREE-03, AGREE-04

**Success Criteria** (what must be TRUE):
  1. Mismatches sao auditados por bucket acionavel e ligados a follow-ups.
  2. Ajustes de prompt/rubric so entram se houver padrao de discordancia e regressao factual/export verde.
  3. Release evidence final declara claims permitidos, proibidos e bloqueados.
  4. v12.8/v12.9 debt fica fechado ou carregado com blockers concretos.

**Plans:** 0/2 plans complete

Plans:
- [ ] 150-01-PLAN.md — Agreement mismatch audit and safe calibration adjustments
- [ ] 150-02-PLAN.md — Final evidence refresh, claims gate and milestone audit

---

## Completed Milestone Context

Latest archive: [v12.8-ROADMAP.md](milestones/v12.8-ROADMAP.md) · [v12.8-REQUIREMENTS.md](milestones/v12.8-REQUIREMENTS.md) · [v12.8-MILESTONE-AUDIT.md](milestones/v12.8-MILESTONE-AUDIT.md)

Previous archive: [v12.7-ROADMAP.md](milestones/v12.7-ROADMAP.md) · [v12.7-REQUIREMENTS.md](milestones/v12.7-REQUIREMENTS.md) · [v12.7-MILESTONE-AUDIT.md](milestones/v12.7-MILESTONE-AUDIT.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 147 | v12.9 | 2/2 | Complete (human_needed) | 2026-06-19 |
| 148 | v12.9 | 0/2 | Pending | — |
| 149 | v12.9 | 0/2 | Pending | — |
| 150 | v12.9 | 0/2 | Pending | — |

---
*Roadmap updated: 2026-06-19 — v12.9 started from v12.8 human_needed claims gate*
