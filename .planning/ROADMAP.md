# Roadmap: ADScale

## Milestones

- 🚧 **v12.8 Operacao Real do Olhar Cenbrap** - Phases 143-146 (active; started 2026-06-19)
- ✅ **v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance** - Phases 138-142 (shipped 2026-06-19; tech debt: template Cenbrap calibration, operator decisions pending)
- ✅ **v12.6 Operacao Live do Corpus de Qualidade** - Phases 134-137 (shipped 2026-06-18; tech debt: empty live corpus, template 135/136 fallbacks)
- ✅ **v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo** - Phases 129-133 (shipped 2026-06-17; tech debt: empty live corpus)
- ✅ **v12.4 Aprendizado de Qualidade dos Outputs** - Phases 124-128 (shipped 2026-06-17)
- ✅ **v12.3 Integridade Criativa** - Phases 115-123 (shipped 2026-06-16; QA-19 accepted gap)
- ✅ **v12.2 Refinamento Visual e Consistência da Interface** - Phases 109-114 (shipped 2026-06-14)
- ✅ **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (shipped 2026-06-12)
- ✅ **v12.0 Monetização Real** - Phases 97-102 (shipped 2026-06-11)

## Phases

### 🚧 v12.8 Operacao Real do Olhar Cenbrap (Phases 143-146) — ACTIVE

**Milestone Goal:** Sair da evidencia template do v12.7 e operar a calibracao real do Olhar Cenbrap: campanhas reais, decisoes do Jhonatan, metricas honestas e fechamento/carry-forward explicito da divida.

**Starting point:** `v12.7-MILESTONE-AUDIT.md` fechou como `tech_debt`; Phase 143 depois provou o runner live, mas o ambiente conectado voltou `mode=live`, `evaluatedCampaignCount=0`, `humanDecisionCount=0`, `agreementRate=null` e blocker `insufficient_campaigns`.

- [x] **Phase 143: Live Cenbrap Calibration Run** — completed with blocker `insufficient_campaigns`; runner live funcionou, corpus Cenbrap conectado estava vazio. (completed 2026-06-19)
- [x] **Phase 144: Cenbrap Corpus Seeding and Calibration Rerun** — criar/identificar corpus revisavel, re-rodar calibracao live e liberar contact sheet `review_ready`. (completed 2026-06-19)
- [ ] **Phase 145: Jhonatan Decision Capture and Mismatch Triage** — capturar `entra/quase/nao_entra`, motivos de mismatch e filas de follow-up.
- [ ] **Phase 146: Evidence Refresh and Claims Gate** — regenerar evidencia, fechar/carry-forward da divida v12.7 e bloquear claims se a amostra ainda for insuficiente.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 143 | Live Cenbrap Calibration Run | CENLIVE-01..04 | Complete   | 2026-06-19 |
| 144 | Cenbrap Corpus Seeding and Calibration Rerun | Complete    | 2026-06-19 | 2026-06-19 |
| 145 | Jhonatan Decision Capture and Mismatch Triage | JUDGE-01..04 | Pending | — |
| 146 | Evidence Refresh and Claims Gate | CLAIM-01..04 | Pending | — |

## Phase Details

### Phase 143: Live Cenbrap Calibration Run

**Goal:** Rodar a calibracao Cenbrap contra ambiente real e substituir a evidencia template por artefatos com campanhas/derivacoes reais ou blocker operacional explicito.

**Depends on:** v12.7 Phase 142 calibration infrastructure

**Requirements:** CENLIVE-01, CENLIVE-02, CENLIVE-03, CENLIVE-04

**Success Criteria** (what must be TRUE):
  1. `run-cenbrap-calibration.ts` runs without `--template` against a configured environment or emits a blocker typed with exact missing prerequisite.
  2. `142-CENBRAP-CALIBRATION.json` exists with live mode and at least two Cenbrap campaigns, or an explicit insufficient-campaign blocker.
  3. `142-CONTACT-SHEET.md` contains real rows with safe derivation refs, dual verdicts, package eligibility and override markers.
  4. Missing dual-verdict rows are counted and routed to follow-up instead of being inferred.

**Plans:** 2/2 plans complete

Plans:
- [x] 143-01-PLAN.md — Live environment calibration execution and artifact refresh
- [x] 143-02-PLAN.md — Dual-verdict coverage cleanup and blocker classification

---

### Phase 144: Cenbrap Corpus Seeding and Calibration Rerun

**Goal:** Desbloquear a calibracao humana criando ou identificando um corpus Cenbrap real, revisavel e seguro: pelo menos duas campanhas com derivacoes, refs seguras, dual verdict e contact sheet `review_ready`.

**Depends on:** Phase 143

**Requirements:** CORPUS-01, CORPUS-02, CORPUS-03, CORPUS-04

**Success Criteria** (what must be TRUE):
  1. Existing DB is inspected for Cenbrap candidates without exposing secrets, prompts or signed URLs.
  2. At least two Cenbrap campaigns with derivations exist in the calibration environment, or `operator_data_unavailable` is documented.
  3. Reviewable rows include safe `outputKey`, `olharVerdict` and `exportStatus`; missing rows are excluded or routed.
  4. Calibration rerun produces `mode=live`, `evaluatedCampaignCount >= 2` and `review_ready > 0`, or Phase 145 remains blocked with an exact blocker.

**Plans:** 2/2 plans complete

Plans:
- [x] 144-01-PLAN.md — Corpus source inspection and safe seeding path
- [x] 144-02-PLAN.md — Dual-verdict readiness and live calibration rerun

---

### Phase 145: Jhonatan Decision Capture and Mismatch Triage

**Goal:** Transformar o contact sheet em calibracao humana: Jhonatan decide `entra/quase/nao_entra`, e o sistema classifica acordos, desacordos e motivos acionaveis.

**Depends on:** Phase 144

**Requirements:** JUDGE-01, JUDGE-02, JUDGE-03, JUDGE-04

**Success Criteria** (what must be TRUE):
  1. Contact sheet ou evento canonico registra decisoes humanas por derivacao com reviewer/reviewedAt.
  2. Mismatch reasons sao normalizados em buckets acionaveis.
  3. Agreement metrics usam apenas linhas comparaveis com veredito do sistema e decisao humana.
  4. As decisoes do Jhonatan ficam ligadas ao artifact/evidence sem vazar prompt, signed URL ou payload sensivel.

**Plans:** 0/2 plans complete

Plans:
- [ ] 145-01-PLAN.md — Operator decision capture workflow
- [ ] 145-02-PLAN.md — Mismatch taxonomy and comparable-row agreement metrics

---

### Phase 146: Evidence Refresh and Claims Gate

**Goal:** Atualizar a evidencia de release com dados reais e fechar v12.8 com linguagem honesta: clean pass, human_needed, insufficient_sample ou tech_debt, sem score unico enganoso.

**Depends on:** Phase 145

**Requirements:** CLAIM-01, CLAIM-02, CLAIM-03, CLAIM-04

**Success Criteria** (what must be TRUE):
  1. Evidence JSON consome calibracao live e atualiza contadores de acordo, mismatch, sem-opiniao, export block e override.
  2. `agreementRate` e qualquer claim de qualidade permanecem null/withheld quando sample guidance bloqueia.
  3. Audit separa factual/export safety de art-direction agreement.
  4. v12.7 tech debt e v12.8 status final ficam sincronizados em PROJECT/ROADMAP/STATE/MILESTONES.

**Plans:** 0/2 plans complete

Plans:
- [ ] 146-01-PLAN.md — Live evidence refresh and release gate rerun
- [ ] 146-02-PLAN.md — Milestone audit, tech-debt closure and planning sync

---

## Completed Milestone Context

Latest archive: [v12.7-ROADMAP.md](milestones/v12.7-ROADMAP.md) · [v12.7-REQUIREMENTS.md](milestones/v12.7-REQUIREMENTS.md) · [v12.7-MILESTONE-AUDIT.md](milestones/v12.7-MILESTONE-AUDIT.md)

Archive: [v12.6-ROADMAP.md](milestones/v12.6-ROADMAP.md) · [v12.6-REQUIREMENTS.md](milestones/v12.6-REQUIREMENTS.md) · [v12.6-MILESTONE-AUDIT.md](milestones/v12.6-MILESTONE-AUDIT.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 143 | v12.8 | 2/2 | Complete | 2026-06-19 |
| 144 | v12.8 | 0/2 | Planned | — |
| 145 | v12.8 | 0/2 | Pending | — |
| 146 | v12.8 | 0/2 | Pending | — |

---
*Roadmap updated: 2026-06-19 — Phase 144 planned from Phase 143 insufficient_campaigns blocker*
