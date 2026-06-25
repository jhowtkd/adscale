# Roadmap: ADScale

## Milestones

- 🚧 **v13.4 Fechamento de Evidência Operacional** - Phases 173-176 (active — roadmap defined 2026-06-25)
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

### 🚧 v13.4 Fechamento de Evidência Operacional (Phases 173-176)

**Milestone Goal:** Fechar o tech debt operacional da v13.3 — sair de `fixtureOnly: true` e `operationalEvidence: insufficient_sample` para amostra `real_customer` por `clientProfileId`, smoke owner com dado live, e release gate que só libera claims quando a suficiência passar.

**Guiding constraints:**
- Não abrir novo eixo criativo; só fechar evidência operacional.
- Cenbrap permanece fixture/seed; o perfil alvo deve ser não-fixture ou explicitamente rotulado.
- Claims de customer-real só desbloqueiam com evidência registrada — sem override manual.
- Infraestrutura v13.3 (promoção genérica, claim gates, release gate) é ponto de partida, não reimplementação.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 173 | Live Real-Customer Corpus Intake | LIVE-01..03 | Planned | - |
| 174 | Sample Sufficiency and Claim Honesty | SAMPLE-01..03 | Planned | - |
| 175 | Owner Smoke and Evidence Capture | SMOKE-01..03, EVIDENCE-01 | Planned | - |
| 176 | Operational Release Gate and Claim Unlock | EVIDENCE-02..03 | Planned | - |

## Phase Details

### Phase 173: Live Real-Customer Corpus Intake

**Goal:** Seed at least one non-fixture `clientProfileId` with `real_customer` corpus rows through the generic v13.3 promotion/import path.

**Depends on:** v13.3 Phase 169 source-labeled promotion and claim gate infrastructure.

**Requirements**: LIVE-01, LIVE-02, LIVE-03

**Success Criteria** (what must be TRUE):
  1. Owner can promote or import rows with `real_customer` sourceLabel for a selected non-fixture profile without customer-specific scripts.
  2. Active evidence scope shows `real_customer` counts alongside fixture/operator_imported composition for that profile.
  3. UI and evidence copy keep Cenbrap as fixture/seed when it appears; real profile is the proof target.

**Plans:** 0/TBD

---

### Phase 174: Sample Sufficiency and Claim Honesty

**Goal:** Lift `fixtureOnly` only when sample sufficiency rules pass; keep claims withheld until honest.

**Depends on:** Phase 173 live corpus rows.

**Requirements**: SAMPLE-01, SAMPLE-02, SAMPLE-03

**Success Criteria** (what must be TRUE):
  1. `activeBrandSample.fixtureOnly` is `false` when the selected profile has sufficient `real_customer` sample.
  2. Customer-real, agreement-rate and quality-improvement claims stay blocked when sufficiency fails.
  3. Fixture-only rows alone never unlock customer-real claims.

**Plans:** 0/TBD

---

### Phase 175: Owner Smoke and Evidence Capture

**Goal:** Execute `172-RELEASE-CHECKLIST.md` with live workspace data and capture outcomes in the evidence artifact.

**Depends on:** Phases 173–174; v13.3 Phase 172 release checklist and evidence template.

**Requirements**: SMOKE-01, SMOKE-02, SMOKE-03, EVIDENCE-01

**Success Criteria** (what must be TRUE):
  1. Owner completes factual-alert, link-safety, and proposal-separation smoke items with live data.
  2. Settings persistence smoke (save + hard refresh) is recorded pass/fail honestly.
  3. `172-EVIDENCE.json` reflects updated `activeBrandSample` and operational smoke outcomes.

**Plans:** 0/TBD

---

### Phase 176: Operational Release Gate and Claim Unlock

**Goal:** Rerun release gate until operational evidence passes; apply claim unlock only with recorded proof.

**Depends on:** Phase 175 evidence artifact update.

**Requirements**: EVIDENCE-02, EVIDENCE-03

**Success Criteria** (what must be TRUE):
  1. Release gate reports `operationalEvidence` beyond `insufficient_sample` when criteria are met.
  2. Root milestone status reflects operational pass (not `tech_debt` from insufficient sample).
  3. Customer-real claim unlock policy enforces technical + operational pass — no silent override.

**Plans:** 0/TBD

---

## Completed Milestone Context

### ✅ v13.3 Tracao Multi-Cliente (Phases 168-172)

**Shipped 2026-06-25** with tech debt: `operationalEvidence: insufficient_sample`, `activeBrandSample.fixtureOnly: true`, owner smoke pending.

Archive: [v13.3-ROADMAP.md](milestones/v13.3-ROADMAP.md) · [v13.3-REQUIREMENTS.md](milestones/v13.3-REQUIREMENTS.md) · [v13.3-MILESTONE-AUDIT.md](milestones/v13.3-MILESTONE-AUDIT.md)

## Progress

**Current milestone:** v13.4 — 0/4 phases complete

**Next phase:** 173 — Live Real-Customer Corpus Intake
