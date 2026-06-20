# Roadmap: ADScale

## Milestones

- 🔄 **v13.1 Global Owner Quality Corpus** - Phases 157-161 (active; owner-only global corpus, human evaluation, feedback generation and evidence-safe quality loop)
- ✅ **v13.0 Brand Taste Calibration Loop** - Phases 151-156 (shipped 2026-06-20; tech debt: 5 Jhonatan decisions pending, fixture-only corpus, agreement claims blocked)
- ✅ **v12.9 Fechamento Humano do Olhar Cenbrap** - Phases 147-150 (shipped 2026-06-20; tech debt: 5 Jhonatan decisions pending, customer-real corpus deferred, agreement claims blocked)
- ✅ **v12.8 Operacao Real do Olhar Cenbrap** - Phases 143-146 (shipped 2026-06-19; tech debt: Jhonatan decisions pending, sample 0/5, synthetic_fixture corpus)
- ✅ **v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance** - Phases 138-142 (shipped 2026-06-19; tech debt partially closed by v12.8/v12.9)
- ✅ **v12.6 Operacao Live do Corpus de Qualidade** - Phases 134-137 (shipped 2026-06-18; tech debt: empty live corpus, template 135/136 fallbacks)
- ✅ **v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo** - Phases 129-133 (shipped 2026-06-17; tech debt: empty live corpus)
- ✅ **v12.4 Aprendizado de Qualidade dos Outputs** - Phases 124-128 (shipped 2026-06-17)
- ✅ **v12.3 Integridade Criativa** - Phases 115-123 (shipped 2026-06-16; QA-19 accepted gap)
- ✅ **v12.2 Refinamento Visual e Consistência da Interface** - Phases 109-114 (shipped 2026-06-14)
- ✅ **v12.1 Memória Criativa e Aprendizado de Performance** - Phases 103-108 (shipped 2026-06-12)
- ✅ **v12.0 Monetização Real** - Phases 97-102 (shipped 2026-06-11)

## Phases

### 🔄 v13.1 Global Owner Quality Corpus (Phases 157-161) — ACTIVE

**Milestone Goal:** Dar ao dono do projeto um painel global e privado com criativos gerados por todos os usuarios, para avaliar qualidade humana e alimentar o loop de melhoria sem quebrar isolamento de workspace.

**Carry-forward constraints:** Jhonatan decisions for Cenbrap remain pending; customer-real and quality-improvement claims stay blocked until sample/source sufficiency is real.

- [ ] **Phase 157: Global Corpus Access Boundary** — platform-owner global scope, workspace-admin scoped access and server-side workspace resolution. Plans ready.
- [ ] **Phase 158: Candidate Capture and Privacy-Safe Corpus Model** — every generated creative can become a global candidate with sanitized metadata and source composition.
- [ ] **Phase 159: Global Review Queue and Preview** — owner queue, filters, progress and mixed-workspace signed previews.
- [ ] **Phase 160: Human Evaluation and Feedback Artifacts** — global evaluation writes and structured feedback handoff into improvement loops.
- [ ] **Phase 161: Global Evidence and Release Gate** — global analytics, calibration reports and claims gate with sample/source honesty.

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 157 | Global Corpus Access Boundary | ACCESS-01..04 | Planned | — |
| 158 | Candidate Capture and Privacy-Safe Corpus Model | CAPTURE-01..05 | Pending | — |
| 159 | Global Review Queue and Preview | QUEUE-01..05 | Pending | — |
| 160 | Human Evaluation and Feedback Artifacts | EVAL-01..05, LOOP-01..02 | Pending | — |
| 161 | Global Evidence and Release Gate | LOOP-03..05, EVIDENCE-01..05 | Pending | — |

## Phase Details

### Phase 157: Global Corpus Access Boundary

**Goal:** Define and implement the access/scoping boundary for global corpus operations so only platform owners can operate globally while workspace admins remain scoped.

**Depends on:** Existing platform owner auth, workspace auth and human-quality corpus routes

**Requirements:** ACCESS-01, ACCESS-02, ACCESS-03, ACCESS-04

**Success Criteria** (what must be TRUE):
  1. Platform owner can open global corpus without selecting a workspace.
  2. Non-owner users cannot list, preview, evaluate or export global corpus items.
  3. Workspace admins retain only explicit workspace-scoped access.
  4. Evaluation writes resolve workspace from corpus item server-side.

**Plans:** 2/2 plans ready

Planned:
- [ ] 157-01-PLAN.md — Global access contract and route scoping
- [ ] 157-02-PLAN.md — Server-resolved workspace evaluation boundary

---

### Phase 158: Candidate Capture and Privacy-Safe Corpus Model

**Goal:** Turn completed generated creatives into privacy-safe global corpus candidates with dedupe, cohort promotion and source composition.

**Depends on:** Phase 157

**Requirements:** CAPTURE-01, CAPTURE-02, CAPTURE-03, CAPTURE-04, CAPTURE-05

**Success Criteria** (what must be TRUE):
  1. Completed generated creatives can be registered as corpus candidates.
  2. Candidate capture is idempotent per workspace, derivation and corpus version.
  3. Candidate payloads exclude prompts, signed URLs, storage keys, secrets and raw diagnostic text.
  4. Owner can promote candidates into cohorts without duplicating rows.
  5. Source composition separates synthetic, operator-imported and real customer generated outputs.

**Plans:** 0/2 planned

Planned:
- [ ] 158-01-PLAN.md — Candidate registration and dedupe model
- [ ] 158-02-PLAN.md — Sanitized metadata, cohort promotion and source labels

---

### Phase 159: Global Review Queue and Preview

**Goal:** Give the owner a usable global queue with filters, bounded context, progress metrics and mixed-workspace preview signing.

**Depends on:** Phase 158

**Requirements:** QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04, QUEUE-05

**Success Criteria** (what must be TRUE):
  1. Owner can list pending corpus items across all workspaces.
  2. Filters cover workspace, client profile, campaign, mode, format, cohort, status, date and source label.
  3. Review context is sufficient without exposing private prompts or storage identifiers.
  4. Preview image signing works for mixed-workspace result sets.
  5. Queue progress reports global and dimensional pending/evaluated counts.

**Plans:** 0/2 planned

Planned:
- [ ] 159-01-PLAN.md — Global queue API and filters
- [ ] 159-02-PLAN.md — Owner review UI, context and mixed-workspace previews

---

### Phase 160: Human Evaluation and Feedback Artifacts

**Goal:** Let Jhonatan evaluate global corpus items and produce structured feedback artifacts that can feed quality/calibration loops.

**Depends on:** Phase 159

**Requirements:** EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05, LOOP-01, LOOP-02

**Success Criteria** (what must be TRUE):
  1. Owner can submit bounded evaluation fields for any pending global item.
  2. Evaluation writes use the corpus item's workspace, not browser-supplied scope.
  3. Submit-and-next flow advances through the global queue.
  4. Invalid, duplicate or stale evaluation attempts fail clearly.
  5. Structured feedback artifacts link corpus item, derivation, evaluation and source composition.

**Plans:** 0/2 planned

Planned:
- [ ] 160-01-PLAN.md — Global evaluation write path and stale-submit handling
- [ ] 160-02-PLAN.md — Structured feedback artifact generation

---

### Phase 161: Global Evidence and Release Gate

**Goal:** Aggregate global corpus evidence into calibration/quality reports while blocking inflated claims until sample and source conditions are met.

**Depends on:** Phase 160

**Requirements:** LOOP-03, LOOP-04, LOOP-05, EVIDENCE-01, EVIDENCE-02, EVIDENCE-03, EVIDENCE-04, EVIDENCE-05

**Success Criteria** (what must be TRUE):
  1. Score calibration, learning impact and quality-improvement reports can run globally and by filter.
  2. Brand taste calibration consumes global corpus evaluations without cross-client rule leakage.
  3. Owner dashboard reports sample sufficiency, evaluated count, source composition and withheld claims.
  4. Release gate separates technical regression from operational evidence status.
  5. Regression tests cover owner/non-owner access, mixed previews, server-resolved evaluation and global aggregates.

**Plans:** 0/2 planned

Planned:
- [ ] 161-01-PLAN.md — Global calibration/quality analytics
- [ ] 161-02-PLAN.md — Release gate, evidence docs and regression suite

---

## Completed Milestone Context

Latest active predecessor: v13.0 Brand Taste Calibration Loop — Phases 151-156 shipped with tech debt.

Carry-forward evidence blockers:
- 5 Jhonatan decisions pending
- Fixture-only Cenbrap corpus
- Agreement/customer-real claims blocked
- Global quality claims blocked until v13.1 creates sufficient evaluated sample/source evidence

Previous archive: [v12.9-ROADMAP.md](milestones/v12.9-ROADMAP.md) · [v12.9-REQUIREMENTS.md](milestones/v12.9-REQUIREMENTS.md) · [v12.9-MILESTONE-AUDIT.md](milestones/v12.9-MILESTONE-AUDIT.md)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 157 | v13.1 | 0/2 | Planned | — |
| 158 | v13.1 | 0/2 | Pending | — |
| 159 | v13.1 | 0/2 | Pending | — |
| 160 | v13.1 | 0/2 | Pending | — |
| 161 | v13.1 | 0/2 | Pending | — |

---
*Roadmap updated: 2026-06-20 — Phase 157 planned*
