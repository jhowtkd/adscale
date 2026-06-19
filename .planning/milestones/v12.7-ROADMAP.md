# Roadmap: ADScale

## Milestones

- ✅ **v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance** - Phases 138-142 (shipped 2026-06-19; tech debt: template Cenbrap calibration, operator decisions pending)
- ✅ **v12.6 Operacao Live do Corpus de Qualidade** - Phases 134-137 (shipped 2026-06-18; tech debt: empty live corpus, template 135/136 fallbacks)
- ✅ **v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo** - Phases 129-133 (shipped 2026-06-17; tech debt: empty live corpus)
- ✅ **v12.4 Aprendizado de Qualidade dos Outputs** - Phases 124-128 (shipped 2026-06-17)
- ✅ **v12.3 Integridade Criativa** - Phases 115-123 (shipped 2026-06-16; QA-19 accepted gap)
- ✅ **v12.2 Refinamento Visual e Consistência da Interface** - Phases 109-114 (shipped 2026-06-14)
- ✅ **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (shipped 2026-06-12)
- ✅ **v12.0 Monetização Real** - Phases 97-102 (shipped 2026-06-11)

## Phases

### ✅ v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance (Phases 138-142) — SHIPPED WITH TECH DEBT (2026-06-19)

**Milestone Goal:** Separar julgamento de direcao de arte de compliance de exportacao, para que o ADScale julgue figura, gestalt, voz e convite antes de permitir aprovacao ou pacote de entrega.

**Starting point:** campanhas reais expuseram outputs invalidos, aprovacao de peca `approved + invalid`, outputs com estetica de template/interface e prompts que tratam CTA como widget clicavel. v12.3 preservou factualidade, mas deixou o gap visual QA-19 como divida; v12.5/v12.6 criaram infraestrutura de corpus, mas ainda nao trocaram a regua criativa.

- [x] **Phase 138: Olhar Constitution and Cenbrap Voice** — definir a ontologia global do Olhar ADScale e a primeira voz editorial Cenbrap. (completed 2026-06-19)
- [x] **Phase 139: Dual Verdict and Export Validator** — separar contrato criativo (`olharVerdict`) de exportacao (`exportStatus`) e bloquear `approved + invalid`. (completed 2026-06-19)
- [x] **Phase 140: Advisor and Generation Direction** — reescrever preflight, QA, score e prompt-builder para direcao de arte, nao checklist de UX. (completed 2026-06-19)
- [x] **Phase 141: Review Surface and Override UX** — exibir Olhar/Exportacao na workspace, capturar decisao humana e exigir override consciente. (completed 2026-06-19)
- [x] **Phase 142: Cenbrap Calibration and Release Evidence** — reavaliar campanhas reais, medir concordancia com Jhonatan e fechar com evidencia honesta.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 138 | Olhar Constitution and Cenbrap Voice | Complete    | 2026-06-19 | 2026-06-19 |
| 139 | Dual Verdict and Export Validator | Complete    | 2026-06-19 | 2026-06-19 |
| 140 | Advisor and Generation Direction | Complete    | 2026-06-19 | 2026-06-19 |
| 141 | Review Surface and Override UX | 3/3 | Complete   | 2026-06-19 |
| 142 | Cenbrap Calibration and Release Evidence | 2/2 | Complete   | 2026-06-19 |

## Phase Details

### Phase 138: Olhar Constitution and Cenbrap Voice

**Goal:** O sistema ganha uma constituicao criativa clara e uma voz Cenbrap inicial antes de alterar score, gate ou UI.

**Depends on:** v12.3 creative integrity, v12.5/v12.6 quality evidence, `advisor-redesign-v3.md`, attached Olhar ADScale proposal

**Requirements:** OLHAR-01, OLHAR-02, OLHAR-03, OLHAR-04

**Success Criteria** (what must be TRUE):
  1. `Olhar ADScale` defines figure, gestalt, voice, invite and anti-template principles in implementation-facing form.
  2. Cenbrap voice document captures what feels Cenbrap, what is anti-Cenbrap and how authority/people/claims/CTA should behave.
  3. UI-first vocabulary is inventoried and removed from the core creative prompt/rubric language where it drives composition.
  4. Existing visual failure reasons map to first-class art-direction verdicts.

**Plans:** 2/2 plans complete

Plans:
- [x] 138-01-PLAN.md — Olhar ADScale constitution and vocabulary inventory
- [x] 138-02-PLAN.md — Cenbrap voice document and failure mapping

---

### Phase 139: Dual Verdict and Export Validator

**Goal:** Toda derivacao passa a ter duas verdades separadas: se e boa como peca grafica e se pode ser exportada sem risco factual/tecnico.

**Depends on:** Phase 138

**Requirements:** VERDICT-01, VERDICT-02, VERDICT-03, VERDICT-04, EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04

**Success Criteria** (what must be TRUE):
  1. Output metadata can represent `olharVerdict`, four 0-3 axes, direction notes and `exportStatus` independently.
  2. Export validator handles brand/source identity, CTA normalization, offer/claim drift, required text, ratio and resolution deterministically.
  3. Campaign setup mismatch is reported as setup/contract issue, not as art-direction weakness.
  4. Approval APIs cannot create normal `approved + invalid` states.

**Plans:** 2/2 plans complete

Plans:
- [x] 139-01-PLAN.md — Dual-verdict contracts and persistence compatibility
- [x] 139-02-PLAN.md — Deterministic export validator and approval blocking

---

### Phase 140: Advisor and Generation Direction

**Goal:** Preflight, QA, score and generation prompts passam a falar como diretor de arte senior: figura, gestalt, ritmo, convite e voz, mantendo compliance como segunda passagem.

**Depends on:** Phases 138-139

**Requirements:** ADVISOR-01, ADVISOR-02, ADVISOR-03, ADVISOR-04

**Success Criteria** (what must be TRUE):
  1. Preflight becomes `Leitura do base` with dominant idea, gestalt, invite weight, thumbnail read, brand presence and at most two real risks.
  2. Post-generation QA/score returns art-direction verdicts and short notes instead of generic compliance/checklist language.
  3. Prompt builder injects a concise direction paragraph with sacred facts, allowed variation and anti-patterns.
  4. Numeric score is no longer the primary user-facing signal.

**Plans:** 2/2 plans complete

Plans:
- [x] 140-01-PLAN.md — Leitura do base and Passagem Olhar ✅
- [x] 140-02-PLAN.md — Generation direction injection and score demotion ✅

---

### Phase 141: Review Surface and Override UX

**Goal:** A workspace mostra a mesa de direcao correta: Olhar primeiro, exportacao depois, decisoes humanas estruturadas e override auditavel.

**Depends on:** Phase 140

**Requirements:** REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04

**Success Criteria** (what must be TRUE):
  1. Review cards/modals show `Olhar` and `Exportacao` separately, with `Sem opiniao`/`Confusa` unable to enter package by default.
  2. Modal prioritizes creative verdict, what works, what blocks and collapsed export details.
  3. User can record `Entra`, `Quase - regenerar assim` and `Nao entra` with structured direction reason.
  4. Override requires typed reason and creates an auditable event without normalizing weak creative as approved.

**Plans:** 3/3 plans complete

Plans:
- [x] 141-01-PLAN.md — Workspace review UI and decision language
- [x] 141-02-PLAN.md — Override audit trail and package gating
- [x] 141-03-PLAN.md — Conscious override UX gap closure

---

### Phase 142: Cenbrap Calibration and Release Evidence

**Goal:** Provar o novo olhar em campanhas reais Cenbrap, medir concordancia com Jhonatan e fechar com evidencia honesta, sem transformar amostra pequena em claim de qualidade.

**Depends on:** Phases 138-141

**Requirements:** CALIB-01, CALIB-02, CALIB-03, CALIB-04

**Success Criteria** (what must be TRUE):
  1. At least two real Cenbrap campaigns are re-evaluated with contact sheets and dual verdicts.
  2. Jhonatan's decisions are captured against system verdicts with mismatch reasons.
  3. Evidence reports agreement, approved-invalid prevention, sem-opiniao detection and export-block separation.
  4. Release audit keeps factual fidelity, art-direction quality and sample sufficiency separate.

**Plans:** 2/2 plans complete

Plans:
- [x] 142-01-PLAN.md — Cenbrap real-campaign calibration run
- [x] 142-02-PLAN.md — Release evidence, audit and milestone closure

---

## Completed Milestone Context

Latest archive: [v12.6-ROADMAP.md](milestones/v12.6-ROADMAP.md) · [v12.6-REQUIREMENTS.md](milestones/v12.6-REQUIREMENTS.md) · [v12.6-MILESTONE-AUDIT.md](milestones/v12.6-MILESTONE-AUDIT.md)

Archive: [v12.5-ROADMAP.md](milestones/v12.5-ROADMAP.md) · [v12.5-REQUIREMENTS.md](milestones/v12.5-REQUIREMENTS.md) · [v12.5-MILESTONE-AUDIT.md](milestones/v12.5-MILESTONE-AUDIT.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 138 | v12.7 | 2/2 | Complete | 2026-06-19 |
| 139 | v12.7 | 2/2 | Complete | 2026-06-19 |
| 140 | v12.7 | 2/2 | Complete | 2026-06-19 |
| 141 | v12.7 | 3/3 | Complete | 2026-06-19 |
| 142 | v12.7 | 2/2 | Complete | 2026-06-19 |

---
*Roadmap updated: 2026-06-19 — Phase 142 complete; v12.7 milestone audit tech_debt*
