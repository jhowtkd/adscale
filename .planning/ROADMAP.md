# Roadmap: ADScale

## Milestones

- 🚧 **v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo** - Phases 129-133 (active)
- ✅ **v12.4 Aprendizado de Qualidade dos Outputs** - Phases 124-128 (shipped 2026-06-17)
- ✅ **v12.3 Integridade Criativa** - Phases 115-123 (shipped 2026-06-16; QA-19 accepted gap)
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

## Phases

### 🚧 v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo (Phases 129-133) — ACTIVE

**Milestone Goal:** Provar e melhorar a qualidade percebida dos outputs com corpus real avaliado por humanos, mantendo fidelidade factual e o learning loop seguro.

**Starting point:** v12.4 passou com learning loop fixture-based; v12.3 deixou gap aceito de `meanQualityScore 70.17 < 75`.

- [x] **Phase 129: Live Human Quality Corpus** — criar corpus versionado de outputs reais com julgamento humano estruturado (completed 2026-06-17)
- [x] **Phase 130: Score Calibration and Rubric Alignment** — comparar score automatico vs julgamento humano e versionar ajustes de rubric/gate (completed 2026-06-17)
- [x] **Phase 131: Learning Impact Measurement** — medir impacto real de recommendation/prefill de v12.4 em qualidade, rejeicao/regeneracao e factual pass (completed 2026-06-17)
- [x] **Phase 132: Targeted Creative Quality Improvements** — atacar falhas visuais provadas pelo corpus sem regredir factualidade (completed 2026-06-17)
- [ ] **Phase 133: Real Quality Release Gate** — fechar milestone com gate reproduzivel, metricas separadas e caveats explicitos

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 129 | Live Human Quality Corpus | Complete    | 2026-06-17 | 2026-06-17 |
| 130 | Score Calibration and Rubric Alignment | Complete    | 2026-06-17 | 2026-06-17 |
| 131 | Learning Impact Measurement | 4/4 | Complete   | 2026-06-17 |
| 132 | Targeted Creative Quality Improvements | Complete    | 2026-06-17 | 2026-06-17 |
| 133 | Real Quality Release Gate | 3/4 | In Progress|  |

## Phase Details

### Phase 129: Live Human Quality Corpus

**Goal:** Operadores conseguem transformar outputs reais em um corpus versionado de avaliacao de qualidade, com julgamento humano estruturado e referencias seguras.

**Depends on:** v12.4 shipped output-learning evidence and v12.3 factual baseline

**Requirements:** HUMAN-01, HUMAN-02, HUMAN-03, HUMAN-04

**Success Criteria** (what must be TRUE):
  1. Real generated outputs can be selected into a versioned corpus with workspace/campaign/derivation/mode/format scope.
  2. Corpus records bounded artifact references and evaluation metadata without storing raw prompts, signed URLs, auth material or unbounded payloads.
  3. Reviewer can record visual score, factual pass/fail, approve/reject/regenerate intent and primary visible failure reason.
  4. Corpus items distinguish baseline, pre-learning and post-learning samples for later movement analysis.

**Plans:** 3/3 plans complete

---

### Phase 130: Score Calibration and Rubric Alignment

**Goal:** O score automatico passa a ser auditavel contra julgamento humano, e divergencias viram ajustes versionados de rubric/gate.

**Depends on:** Phase 129

**Requirements:** CALIB-01, CALIB-02, CALIB-03, CALIB-04

**Success Criteria** (what must be TRUE):
  1. Each evaluated corpus item can compare automatic quality score with human visual score.
  2. Calibration report groups divergences by visible failure reason, generation mode and format.
  3. Rubric/gate adjustments cite corpus evidence and carry an explicit version.
  4. Factual pass/fail remains separate and cannot be offset by visual score improvements.

**Plans:** 4/4 plans complete

Plans:
- [x] 130-01-PLAN.md — Evaluated corpus join and per-item score comparison (CALIB-01)
- [x] 130-02-PLAN.md — Grouped divergence report and factual metric separation (CALIB-02, CALIB-04)
- [x] 130-03-PLAN.md — Versioned rubric/gate adjustment proposal registry (CALIB-03)
- [x] 130-04-PLAN.md — Evidence CLI, calibration API and read-only UI tab (CALIB-01–04 integration)

---

### Phase 131: Learning Impact Measurement

**Goal:** O produto mede se recommendation/prefill de v12.4 realmente melhora outputs em amostras comparaveis, sem inventar conclusao quando faltam dados.

**Depends on:** Phase 130

**Requirements:** IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04

**Success Criteria** (what must be TRUE):
  1. Generated samples indicate whether output-learning recommendation/prefill was applied.
  2. Reports separate learned vs non-learned comparable outputs by client, mode and format.
  3. Report measures rejection/regeneration intent, human visual score movement and factual pass rate.
  4. Insufficient sample states are explicit and block false claims of improvement.

**Plans:** 4/4 plans complete

Plans:
- [x] 131-01-PLAN.md — Application snapshot schema and API persistence on derivations (IMPACT-01)
- [x] 131-02-PLAN.md — Accept flow threading, corpus freeze, and enrich helpers (IMPACT-01)
- [x] 131-03-PLAN.md — Learning impact report engine with slice comparison and honesty gates (IMPACT-02, IMPACT-03, IMPACT-04)
- [x] 131-04-PLAN.md — Evidence CLI, impact API and read-only Impact UI tab (IMPACT-01–04 integration)

---

### Phase 132: Targeted Creative Quality Improvements

**Goal:** As melhorias de prompt/gate/rubric atacam apenas falhas visuais provadas pelo corpus e preservam protecoes factuais e safety guards.

**Depends on:** Phase 131

**Requirements:** QUALITY-01, QUALITY-02, QUALITY-03, QUALITY-04

**Success Criteria** (what must be TRUE):
  1. Overload, weak hierarchy, generic template feel, illegible CTA and unfocused composition are first-class failure reasons.
  2. Any prompt/gate/rubric change maps back to corpus evidence and a targeted failure reason.
  3. v12.3 factual hard failures and v12.4 learning safety guards remain green.
  4. Re-evaluation shows whether targeted failure frequency decreased.

**Plans:** 4/4 plans complete

Plans:
- [x] 132-01-PLAN.md — Accept lifecycle, apply contracts, and calibration version bump (QUALITY-02)
- [x] 132-02-PLAN.md — Evidence-bound ceiling/rubric/gate edits and visual archetype fixtures (QUALITY-01, QUALITY-02)
- [x] 132-03-PLAN.md — v12.3/v12.4 regression guard wiring and evidence template (QUALITY-03)
- [x] 132-04-PLAN.md — Re-evaluation report, CLI, API, and Quality UI tab (QUALITY-04)

---

### Phase 133: Real Quality Release Gate

**Goal:** O milestone fecha apenas com evidencia reproduzivel de qualidade humana, factualidade preservada, impacto de learning medido e caveats claros.

**Depends on:** Phases 129-132

**Requirements:** QA-22, QA-23, QA-24

**Success Criteria** (what must be TRUE):
  1. Release gate runs corpus/evaluation tests, score calibration checks, v12.3 factual subset, v12.4 output-learning subset, `npm test`, `npm run lint`, and `npm run build`.
  2. Evidence separates quality metrics, factual metrics, learning-impact metrics and accepted caveats.
  3. Milestone passes only if factual pass rate remains 1.0 and quality crosses target or the smaller remaining gap is explicitly accepted.

**Plans:** 3/4 plans executed

Plans:
- [x] 133-01-PLAN.md — Milestone evidence schema + QA-23/24 checker (QA-23, QA-24)
- [x] 133-02-PLAN.md — QA-22 real-quality-release-gate orchestrator (QA-22)
- [x] 133-03-PLAN.md — Evidence aggregation from 130/131/132 + --run-regression / --factual-only (QA-22, QA-23, QA-24)
- [ ] 133-04-PLAN.md — v12.5 milestone audit + ROADMAP/STATE closure (QA-22–24)

---

## Completed Milestone Context

Archive: [v12.4-ROADMAP.md](milestones/v12.4-ROADMAP.md) · [v12.4-REQUIREMENTS.md](milestones/v12.4-REQUIREMENTS.md) · [v12.4-MILESTONE-AUDIT.md](milestones/v12.4-MILESTONE-AUDIT.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 129 | v12.5 | 0/TBD | Planned | — |
| 130 | v12.5 | 0/TBD | Planned | — |
| 131 | v12.5 | 0/TBD | Planned | — |
| 132 | v12.5 | 0/4 | Planned | — |
| 133 | v12.5 | 0/4 | Planned | — |

---
*Roadmap updated: 2026-06-17 — v12.5 initialized after v12.4 shipped*
