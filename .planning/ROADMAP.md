# Roadmap: ADScale

## Milestones

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

## Next Milestone

No active milestone. Run `$gsd-new-milestone` to define the next version.

## Completed Milestone Context

### ✅ v13.3 Tracao Multi-Cliente (Phases 168-172)

**Milestone Goal:** Corrigir a direcao pos-v13.2 para que ADScale prove tracao de produto de forma cliente-agnostica: decisoes humanas, corpus real, narrativa, settings persistentes e alertas operacionais devem funcionar para qualquer `clientProfile`, sem tratar Cenbrap como cliente-modelo.

**Completed 2026-06-25:**
- Phase 168: Client-Agnostic Human Decision Intake (3/3 plans)
- Phase 169: Real Corpus and Claim Gates (3/3 plans)
- Phase 170: Product Narrative Rollout (3/3 plans)
- Phase 171: Persistent Product Trust Baseline (4/4 plans)
- Phase 172: Operational Evidence UI and Release Gate (3/3 plans)

**Tech debt accepted:** `172-EVIDENCE.json` reports `technicalRegression: pass` and `operationalEvidence: insufficient_sample` (`activeBrandSample.fixtureOnly: true`, zero `real_customer` rows). Owner smoke checklist (`172-RELEASE-CHECKLIST.md`) and manual UAT for settings refresh, narrative tone, and live multi-brand corpus remain operational follow-up — not blockers for milestone closure.

**Carry-forward:** Customer-real, agreement-rate and quality-improvement claims stay blocked until live owner corpus and smoke complete per brand.

Archive: [v13.3-ROADMAP.md](milestones/v13.3-ROADMAP.md) · [v13.3-REQUIREMENTS.md](milestones/v13.3-REQUIREMENTS.md) · [v13.3-MILESTONE-AUDIT.md](milestones/v13.3-MILESTONE-AUDIT.md)

### ✅ v13.2 Calibracao Multi-Marca (Phases 162-167)

**Milestone Goal:** Generalizar calibracao de gosto de marca para qualquer `clientProfile`, removendo hardcode Cenbrap do caminho de geracao e adicionando owner-only surfaces para perfil, regras, propostas, evidencias e promocao cross-client.

**Completed 2026-06-24:**
- Phase 162: Per-Brand Voice Configuration
- Phase 163: Corpus Learning Proposals
- Phase 164: Prompt Rule Application
- Phase 165: Owner Calibration Panel
- Phase 166: Per-Brand Evidence Gate
- Phase 167: Global Cross-Client Promotion

**Carry-forward into v13.3:** v13.2 proved the infrastructure, but not customer-agnostic product traction. Cenbrap evidence remains fixture/seed unless replaced by generic real-client corpus and decisions.

Archive: [v13.2-ROADMAP.md](milestones/v13.2-ROADMAP.md) · [v13.2-REQUIREMENTS.md](milestones/v13.2-REQUIREMENTS.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 162 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 163 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 164 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 165 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 166 | v13.2 | 2/2 | Complete | 2026-06-24 |
| 167 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 168 | v13.3 | 3/3 | Complete | 2026-06-25 |
| 169 | v13.3 | 3/3 | Complete | 2026-06-25 |
| 170 | v13.3 | 3/3 | Complete | 2026-06-25 |
| 171 | v13.3 | 4/4 | Complete | 2026-06-25 |
| 172 | v13.3 | 3/3 | Complete | 2026-06-25 |

---
*Roadmap updated: 2026-06-25 — v13.3 Tracao Multi-Cliente shipped with accepted tech debt*
