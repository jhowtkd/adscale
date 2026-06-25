# Roadmap: ADScale

## Milestones

- 🚧 **v13.3 Tracao Multi-Cliente** - Phases 168-172 (active — roadmap defined 2026-06-25)
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

### 🚧 v13.3 Tracao Multi-Cliente (Phases 168-172)

**Milestone Goal:** Corrigir a direcao pos-v13.2 para que ADScale prove tracao de produto de forma cliente-agnostica: decisoes humanas, corpus real, narrativa, settings persistentes e alertas operacionais devem funcionar para qualquer `clientProfile`, sem tratar Cenbrap como cliente-modelo.

**Guiding constraints:**
- Cenbrap can remain as fixture/seed compatibility data only.
- External claims require sample/source sufficiency per selected brand.
- Product trust and narrative take priority over deeper owner-only calibration operations.
- Do not ship new creative feature axes before the customer-agnostic foundation is credible.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 168 | Client-Agnostic Human Decision Intake | 3/3 | Complete   | 2026-06-25 |
| 169 | Real Corpus and Claim Gates | SOURCE-01..05 | Planned | - |
| 170 | Product Narrative Rollout | BRAND-01..04 | Planned | - |
| 171 | Persistent Product Trust Baseline | TRUST-01..05 | Planned | - |
| 172 | Operational Evidence UI and Release Gate | ALERT-01..04 | Planned | - |

## Phase Details

### Phase 168: Client-Agnostic Human Decision Intake

**Goal:** Let the owner record human creative judgments for any brand/profile without Cenbrap-specific scripts or assumptions.

**Depends on:** v13.2 clientProfile-scoped calibration infrastructure and global corpus owner access.

**Requirements**: DECISION-01, DECISION-02, DECISION-03, DECISION-04, DECISION-05

**Success Criteria** (what must be TRUE):
  1. Owner can record a bounded judgment for an eligible item tied to any `clientProfileId`.
  2. Persisted decision evidence includes workspace, `clientProfileId`, source label, reviewer, reviewedAt, verdict and rationale.
  3. UI and evidence copy explicitly frame Cenbrap as fixture/seed data when it appears.
  4. Per-brand evidence updates from the generic decision path.
  5. Cross-profile isolation is covered by automated tests.

**Plans:** 3/3 plans complete

Plans:
- [x] 168-01-PLAN.md - Generic evaluation-to-decision bridge
- [x] 168-02-PLAN.md - Client-agnostic queue UI and fixture-safe copy
- [x] 168-03-PLAN.md - Evidence isolation and phase verification

---

### Phase 169: Real Corpus and Claim Gates

**Goal:** Give the product a generic path for real customer/operator corpus rows and keep claims blocked until source/sample sufficiency is real.

**Depends on:** Phase 168

**Requirements**: SOURCE-01, SOURCE-02, SOURCE-03, SOURCE-04, SOURCE-05

**Success Criteria** (what must be TRUE):
  1. Owner can import or promote corpus rows for any `clientProfileId` with explicit `sourceLabel`.
  2. Evidence surfaces show `synthetic_fixture`, `operator_imported` and `real_customer` composition.
  3. Fixture-only rows validate operation but never unlock customer-real claims.
  4. Brand-level claim gates use the selected profile's source/sample sufficiency.
  5. Release evidence separates technical regression from operational evidence status.

**Plans:** 0/TBD

---

### Phase 170: Product Narrative Rollout

**Goal:** Move approved product positioning into the authenticated app so users understand ADScale as a curator workflow, not a generic image generator.

**Depends on:** marketing/brand/conceituacao.md approval status and existing app copy surfaces.

**Requirements**: BRAND-01, BRAND-02, BRAND-03, BRAND-04

**Success Criteria** (what must be TRUE):
  1. "Curator > operator" language appears where it clarifies user workflow decisions.
  2. Onboarding and empty states explain the curator role without internal calibration jargon.
  3. Campaign creation, generation, review and settings use consistent product language.
  4. Review checklist prevents overclaims about automation, performance lift or customer-real proof.

**Plans:** 0/TBD

---

### Phase 171: Persistent Product Trust Baseline

**Goal:** Remove first-use trust breaks from settings by making profile and workspace state persistent, deterministic and honestly gated.

**Depends on:** Existing settings UI and workspace/user APIs.

**Requirements**: TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05

**Success Criteria** (what must be TRUE):
  1. Profile settings save through backend persistence and survive refresh/login changes.
  2. Workspace settings save through backend persistence and survive refresh/login changes.
  3. Disabled tabs are hidden or shown with honest unavailable states.
  4. Save, error and loading behavior is deterministic and tested.
  5. Existing settings surfaces retain their current behavior.

**Plans:** 0/TBD

---

### Phase 172: Operational Evidence UI and Release Gate

**Goal:** Surface existing factual issue alerts and close v13.3 with evidence that the new client-agnostic surfaces are usable and honest.

**Depends on:** Phase 168, Phase 169 and existing factual-alerts API.

**Requirements**: ALERT-01, ALERT-02, ALERT-03, ALERT-04

**Success Criteria** (what must be TRUE):
  1. Owner can see factual issue alerts in the quality/admin UI.
  2. Alerts link to relevant workspace/profile/slice evidence without exposing private prompt or storage data.
  3. UI distinguishes factual issues from promptable corpus-quality rules.
  4. Release checklist covers decision intake, real corpus/source gates, narrative rollout, settings persistence and alerts.

**Plans:** 0/TBD

---

## Completed Milestone Context

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

Previous archive: [v13.2-ROADMAP.md](milestones/v13.2-ROADMAP.md) · [v13.2-REQUIREMENTS.md](milestones/v13.2-REQUIREMENTS.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 162 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 163 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 164 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 165 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 166 | v13.2 | 2/2 | Complete | 2026-06-24 |
| 167 | v13.2 | 3/3 | Complete | 2026-06-24 |
| 168 | v13.3 | 0/3 | Planned | - |
| 169 | v13.3 | 0/TBD | Planned | - |
| 170 | v13.3 | 0/TBD | Planned | - |
| 171 | v13.3 | 0/TBD | Planned | - |
| 172 | v13.3 | 0/TBD | Planned | - |

---
*Roadmap updated: 2026-06-25 — v13.3 Tracao Multi-Cliente defined*
