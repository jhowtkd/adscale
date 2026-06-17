# Roadmap: ADScale

## Milestones

- 🟡 **v12.6 Operacao Live do Corpus de Qualidade** - Phases 134-137 (active)
- ✅ **v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo** - Phases 129-133 (shipped 2026-06-17; tech debt: empty live corpus)
- ✅ **v12.4 Aprendizado de Qualidade dos Outputs** - Phases 124-128 (shipped 2026-06-17)
- ✅ **v12.3 Integridade Criativa** - Phases 115-123 (shipped 2026-06-16; QA-19 accepted gap)
- ✅ **v12.2 Refinamento Visual e Consistência da Interface** - Phases 109-114 (shipped 2026-06-14)
- ✅ **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (shipped 2026-06-12)
- ✅ **v12.0 Monetização Real** - Phases 97-102 (shipped 2026-06-11)

## Phases

### 🟡 v12.6 Operacao Live do Corpus de Qualidade (Phases 134-137) — ACTIVE

**Milestone Goal:** Fazer o corpus live rodar em operacao real, com amostragem, avaliacao humana, tendencias e release gate que so permita claims quando houver evidencia suficiente.

**Starting point:** v12.5 passou tecnicamente, mas o audit registrou corpus live vazio (`evaluatedItemCount=0`) e QA-24 fechou por `accepted_gap`.

- [ ] **Phase 134: Live Corpus Operations** — transformar selecao e avaliacao humana de outputs reais em rotina operacional segura (planned 2026-06-17)
- [ ] **Phase 135: Sampling Sufficiency and Evidence Honesty** — definir thresholds e estados honestos para bloquear claims com pouca amostra
- [ ] **Phase 136: Quality Trend Dashboard** — expor tendencias live, filtros e drilldown de evidencia para owner decisions
- [ ] **Phase 137: Operational Quality Release Gate** — fechar milestone com gate live, regressao tecnica e audit operacional separados

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 134 | Live Corpus Operations | 2/3 | In Progress|  |
| 135 | Sampling Sufficiency and Evidence Honesty | SAMPLE-01..04 | Pending | — |
| 136 | Quality Trend Dashboard | TREND-01..04 | Pending | — |
| 137 | Operational Quality Release Gate | QALIVE-01..04 | Pending | — |

## Phase Details

### Phase 134: Live Corpus Operations

**Goal:** Operadores conseguem montar e avaliar um lote real de outputs para o corpus live sem vazar dados sensiveis e sem depender de fixtures.

**Depends on:** v12.5 corpus/evaluation infrastructure

**Requirements:** LIVEQUAL-01, LIVEQUAL-02, LIVEQUAL-03, LIVEQUAL-04

**Success Criteria** (what must be TRUE):
  1. Operator can select eligible real outputs into a weekly corpus batch.
  2. Review queue exposes workspace, campaign, mode, format, cohort and reviewer status.
  3. Reviewer completes structured evaluation in a fast repeatable flow.
  4. Unsafe artifacts are rejected and raw prompts/signed URLs/secrets are never persisted.

**Plans:** 2/3 plans executed

Plans:
- [x] 134-01-PLAN.md — Batch selection and queue progress contracts (LIVEQUAL-01, LIVEQUAL-02, LIVEQUAL-04)
- [x] 134-02-PLAN.md — Operator review UX and fast evaluation loop (LIVEQUAL-02, LIVEQUAL-03, LIVEQUAL-04)
- [ ] 134-03-PLAN.md — Phase verification and operator handoff (LIVEQUAL-01..04)

---

### Phase 135: Sampling Sufficiency and Evidence Honesty

**Goal:** O sistema sabe quando ha amostra suficiente para tendencias e quando deve bloquear conclusoes.

**Depends on:** Phase 134

**Requirements:** SAMPLE-01, SAMPLE-02, SAMPLE-03, SAMPLE-04

**Success Criteria** (what must be TRUE):
  1. Minimum sample thresholds exist for trend, calibration and impact slices.
  2. Reports return `insufficient_sample` with next-sample guidance when needed.
  3. Fixture, live-human and accepted-caveat metrics remain separated in evidence.
  4. Operator can see which slices need more samples for the next gate.

**Plans:** 0/0 plans complete

---

### Phase 136: Quality Trend Dashboard

**Goal:** Owner consegue acompanhar qualidade real ao longo do tempo e decidir onde intervir.

**Depends on:** Phase 135

**Requirements:** TREND-01, TREND-02, TREND-03, TREND-04

**Success Criteria** (what must be TRUE):
  1. Dashboard shows live human quality trend, factual pass rate and learning-impact status.
  2. Trends can be filtered by workspace, mode, format, client profile and failure reason.
  3. Regressions, stale evidence and insufficient coverage are flagged separately.
  4. Aggregates link back to bounded corpus evidence.

**Plans:** 0/0 plans complete

---

### Phase 137: Operational Quality Release Gate

**Goal:** O milestone fecha com evidencia live auditavel e sem confundir regressao tecnica verde com qualidade operacional provada.

**Depends on:** Phases 134-136

**Requirements:** QALIVE-01, QALIVE-02, QALIVE-03, QALIVE-04

**Success Criteria** (what must be TRUE):
  1. Gate reruns score calibration, learning impact, quality improvement and real-quality aggregate against live evidence.
  2. Technical regression status is reported separately from operational-evidence status.
  3. Quality-improvement claims require sample sufficiency and factual pass rate 1.0.
  4. Audit records commands, sample counts, caveats and next operator action.

**Plans:** 0/0 plans complete

---

## Completed Milestone Context

Archive: [v12.5-ROADMAP.md](milestones/v12.5-ROADMAP.md) · [v12.5-REQUIREMENTS.md](milestones/v12.5-REQUIREMENTS.md) · [v12.5-MILESTONE-AUDIT.md](milestones/v12.5-MILESTONE-AUDIT.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 134 | v12.6 | 1/3 | In Progress | 134-01 |
| 135 | v12.6 | 0/0 | Pending | — |
| 136 | v12.6 | 0/0 | Pending | — |
| 137 | v12.6 | 0/0 | Pending | — |

---
*Roadmap updated: 2026-06-17 — Phase 134 planned; next step is Phase 134 execution*
