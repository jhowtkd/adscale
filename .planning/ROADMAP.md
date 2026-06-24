# Roadmap: ADScale

## Milestones

- 🚧 **v13.2 Calibração Multi-Marca** - Phases 162-167 (in progress — roadmap defined 2026-06-23)
- 🔄 **v13.1 Global Owner Quality Corpus** - Phases 157-161 (passed_with_tech_debt — commit pending)
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

### ✅ v13.1 Global Owner Quality Corpus (Phases 157-161) — PASSED WITH TECH DEBT

**Milestone Goal:** Dar ao dono do projeto um painel global e privado com criativos gerados por todos os usuarios, para avaliar qualidade humana e alimentar o loop de melhoria sem quebrar isolamento de workspace.

**Carry-forward constraints:** Jhonatan decisions for Cenbrap remain pending; customer-real and quality-improvement claims stay blocked until sample/source sufficiency is real.

- [x] **Phase 157: Global Corpus Access Boundary** — platform-owner global scope, workspace-admin scoped access and server-side workspace resolution. **Complete 2026-06-20.**
- [x] **Phase 158: Candidate Capture and Privacy-Safe Corpus Model** — auto-capture, source labels, owner promotion. **Complete 2026-06-20.**
- [x] **Phase 159: Global Review Queue and Preview** — filters, source labels, mixed-workspace previews, global UI. **Complete 2026-06-20.**
- [x] **Phase 160: Human Evaluation and Feedback Artifacts** — global evaluation writes and structured feedback handoff into improvement loops. **Complete 2026-06-20.**
- [x] **Phase 161: Global Evidence and Release Gate** — global analytics, calibration reports and claims gate with sample/source honesty. **Complete 2026-06-20.**

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 157 | Global Corpus Access Boundary | ACCESS-01..04 | Complete | 2026-06-20 |
| 158 | Candidate Capture and Privacy-Safe Corpus Model | CAPTURE-01..05 | Complete | 2026-06-20 |
| 159 | Global Review Queue and Preview | QUEUE-01..05 | Complete | 2026-06-20 |
| 160 | Human Evaluation and Feedback Artifacts | EVAL-01..05, LOOP-01..02 | Complete | 2026-06-20 |
| 161 | Global Evidence and Release Gate | LOOP-03..05, EVIDENCE-01..05 | Complete | 2026-06-20 |

### 🚧 v13.2 Calibração Multi-Marca (Phases 162-167)

**Milestone Goal:** Generalizar calibração de gosto de marca para qualquer `clientProfile`: substituir hardcode Cenbrap por configuração por marca, conectar avaliações do corpus global a propostas e regras aprovadas, aplicar constraints no prompt-builder e expor superfície owner-only com claims gate honesto por marca.

**Carry-forward constraints:** 5 Jhonatan decisions pending; fixture-only Cenbrap corpus; agreement/customer-real claims blocked until sample/source sufficiency.

- [x] **Phase 162: Per-Brand Voice Configuration** — schema, resolver by `clientProfileId`, Cenbrap seed and hardcode removal (completed 2026-06-24)
- [ ] **Phase 163: Corpus Learning Proposals** — aggregate evaluations into deduped client proposals with owner accept/reject
- [ ] **Phase 164: Prompt Rule Application** — inject approved rules per profile with provenance log and isolation cap
- [ ] **Phase 165: Owner Calibration Panel** — per-brand profile, rules, proposals and owner-only access
- [ ] **Phase 166: Per-Brand Evidence Gate** — evidence levels, claims matrix and fixture caveats per marca
- [ ] **Phase 167: Global Cross-Client Promotion** — multi-brand rubric adjustment proposals without prompt leakage

| # | Phase | Requirements | Status | Completed |
|---|-------|--------------|--------|-----------|
| 162 | Per-Brand Voice Configuration | Complete    | 2026-06-24 |  |
| 163 | Corpus Learning Proposals | LEARN-01..06 | Not started | - |
| 164 | Prompt Rule Application | APPLY-01..05 | Not started | - |
| 165 | Owner Calibration Panel | PANEL-01..05 | Not started | - |
| 166 | Per-Brand Evidence Gate | EVIDENCE-01..05 | Not started | - |
| 167 | Global Cross-Client Promotion | GLOBAL-01..05 | Not started | - |

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

**Plans:** 2/2 complete

Completed:
- [x] 157-01-PLAN.md — Global access contract and route scoping
- [x] 157-02-PLAN.md — Server-resolved workspace evaluation boundary

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

**Plans:** 2/2 complete

Completed:
- [x] 158-01-PLAN.md — Candidate registration and dedupe model
- [x] 158-02-PLAN.md — Sanitized metadata, cohort promotion and source labels

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

**Plans:** 2/2 complete

Completed:
- [x] 159-01-PLAN.md — Global queue API and filters
- [x] 159-02-PLAN.md — Owner review UI, context and mixed-workspace previews

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

**Plans:** 2/2 complete

- [x] 160-01-PLAN.md — Global evaluation write path and stale-submit handling
- [x] 160-02-PLAN.md — Structured feedback artifact generation

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

**Plans:** 2/2 complete

- [x] 161-01-PLAN.md — Global calibration/quality analytics
- [x] 161-02-PLAN.md — Release gate, evidence docs and regression suite

---

### Phase 162: Per-Brand Voice Configuration

**Goal:** Any `clientProfileId` resolves brand voice from structured DB configuration instead of campaign-name hardcode.

**Depends on:** v13.0 brand-taste infrastructure, v13.1 global corpus (no phase dependency)

**Requirements:** VOICE-01, VOICE-02, VOICE-03, VOICE-04, VOICE-05

**Success Criteria** (what must be TRUE):
  1. Owner can inspect structured voice/olhar configuration (match terms, prompt lines, status) for any `clientProfileId`.
  2. New derivations resolve brand voice by `clientProfileId`, not campaign name string matching.
  3. Cenbrap `clientProfileId` seeded config produces output at parity with pre-migration hardcoded voice.
  4. `resolveClientVoice` hardcode path is removed or reduced to a deprecated fallback no longer used by generation.
  5. Voice configuration is view-only — owner cannot edit freeform constitution text in this milestone.

**Plans:** 3/3 plans complete

Plans:
- [x] 162-01-PLAN.md — Schema, repository, and Cenbrap seed with parity tests
- [x] 162-02-PLAN.md — Profile-based generation resolver and review gate generalization
- [ ] 162-03-PLAN.md — Owner read-only voice inspect API and UI

---

### Phase 163: Corpus Learning Proposals

**Goal:** Global corpus evaluations become client-scoped learning proposals the owner can accept or reject before they affect generation.

**Depends on:** Phase 162

**Requirements:** LEARN-01, LEARN-02, LEARN-03, LEARN-04, LEARN-05, LEARN-06

**Success Criteria** (what must be TRUE):
  1. When a slice reaches ≥3 evaluations with |delta|≥15, the system creates a client-scoped learning proposal for that `clientProfileId`.
  2. At most one active `proposed` proposal exists per `(workspaceId, clientProfileId, sliceKey)`.
  3. Owner can list pending client learning proposals filtered by workspace and `clientProfileId`.
  4. Owner accepting a proposal creates an approved `calibration_rule` with category `corpus_quality` and evidence refs.
  5. Owner rejecting a proposal requires a reason and enforces a 30-day cooldown before re-proposal.
  6. `factual_issue` failure reason never becomes a prompt rule — it surfaces as an admin alert only.

**Plans:** TBD

---

### Phase 164: Prompt Rule Application

**Goal:** Approved brand-taste and `corpus_quality` rules for a `clientProfileId` shape derivation prompts with logged provenance and strict per-brand isolation.

**Depends on:** Phase 163

**Requirements:** APPLY-01, APPLY-02, APPLY-03, APPLY-04, APPLY-05

**Success Criteria** (what must be TRUE):
  1. Next derivation for a `clientProfileId` loads only that profile's approved brand-taste and `corpus_quality` rules.
  2. Prompt-builder injects sections in order: Olhar ADScale → brand-taste → corpus_quality.
  3. Each derivation's generation log records `appliedBrandRuleIds` and `appliedCorpusRuleIds`.
  4. Active `corpus_quality` rules per `clientProfileId` are capped (default 10) with oldest deprecated on overflow.
  5. Rules from one `clientProfileId` never appear in another profile's prompt (integration-tested).

**Plans:** TBD

---

### Phase 165: Owner Calibration Panel

**Goal:** Owner can operate per-brand taste calibration from a single owner-only panel spanning profile, rules and proposals.

**Depends on:** Phase 164

**Requirements:** PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05

**Success Criteria** (what must be TRUE):
  1. Owner can select a `clientProfileId` and view its brand taste profile (patterns, evidence level, caveats).
  2. Owner can view approved and pending calibration rules for the selected brand.
  3. Owner can accept or reject client learning proposals from the same panel.
  4. Panel shows source composition and blocks misleading "fully calibrated" copy when evidence is fixture-only.
  5. Non-owner users cannot access brand calibration panel routes or APIs.

**Plans:** TBD
**UI hint**: yes

---

### Phase 166: Per-Brand Evidence Gate

**Goal:** Each brand's calibration state and product claims reflect honest sample size and source composition.

**Depends on:** Phase 165

**Requirements:** EVIDENCE-01, EVIDENCE-02, EVIDENCE-03, EVIDENCE-04, EVIDENCE-05

**Success Criteria** (what must be TRUE):
  1. Each brand profile exposes evidence level (`uncalibrated`, `seed_calibrated`, `assisted`, `evidence_backed`) derived from decision/evaluation count and source composition.
  2. Per-brand claims matrix blocks customer-real and quality-improvement claims when sample or source gates fail.
  3. Evidence report names exact missing conditions per `clientProfileId` when status is insufficient.
  4. Fixture-only brands always carry an explicit caveat in profile and panel UI.
  5. Tests cover evidence withholding for fixture-only vs mixed-source brands.

**Plans:** TBD
**UI hint**: yes

---

### Phase 167: Global Cross-Client Promotion

**Goal:** Recurring failure patterns across brands can be proposed as global rubric adjustments without breaking per-brand prompt isolation.

**Depends on:** Phase 166

**Requirements:** GLOBAL-01, GLOBAL-02, GLOBAL-03, GLOBAL-04, GLOBAL-05

**Success Criteria** (what must be TRUE):
  1. When the same `primaryFailureReason` has approved `corpus_quality` rules in ≥2 distinct `clientProfileId`s with ≥6 total evaluations, the system proposes global `rubric_calibration_adjustments`.
  2. Global proposals require source composition gate (≥1 `real_customer` or `operator_imported`) or are flagged `fixture_only`.
  3. Owner can accept a global adjustment via the existing calibration-adjustments accept flow with links to supporting client rules.
  4. Global proposals never auto-accept; rejected global proposals require a reason.
  5. Global promotion does not bypass per-brand isolation in prompt application.

**Plans:** TBD

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
| 157 | v13.1 | 2/2 | Complete | 2026-06-20 |
| 158 | v13.1 | 2/2 | Complete | 2026-06-20 |
| 159 | v13.1 | 2/2 | Complete | 2026-06-20 |
| 160 | v13.1 | 2/2 | Complete | 2026-06-20 |
| 161 | v13.1 | 2/2 | Complete | 2026-06-20 |
| 162 | v13.2 | 0/TBD | Not started | - |
| 163 | v13.2 | 0/TBD | Not started | - |
| 164 | v13.2 | 0/TBD | Not started | - |
| 165 | v13.2 | 0/TBD | Not started | - |
| 166 | v13.2 | 0/TBD | Not started | - |
| 167 | v13.2 | 0/TBD | Not started | - |

---
*Roadmap updated: 2026-06-23 — v13.2 Phases 162-167 defined*
