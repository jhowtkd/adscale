# Requirements: ADScale v13.2 Calibração Multi-Marca

**Defined:** 2026-06-23
**Milestone:** v13.2 Calibração Multi-Marca
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Generalizar calibração de gosto de marca para qualquer `clientProfile`: substituir hardcode Cenbrap por configuração por marca, conectar avaliações do corpus global a propostas e regras aprovadas, aplicar constraints no prompt-builder e expor superfície owner-only com claims gate honesto por marca.

**Starting point:** v13.0 entregou brand-taste infra acoplada ao Cenbrap; v13.1 entregou corpus global owner-only; design corpus-learning-loop aprovado; migrations 0051/0052 e APIs admin parcialmente implementadas.

**In scope:** voice config por marca, corpus→propostas→regras, aplicação no prompt, painel owner, evidence gate por marca, promoção cross-client→global.

**Out of scope:** editor livre de voz, auto-approve, UI workspace admin/end-user, regenerate automático, fine-tuning, claims comerciais sem amostra real.

## Requirements

### Voice Configuration (VOICE)

- [x] **VOICE-01**: System stores structured voice/olhar configuration per `clientProfileId` (match terms, prompt lines, status).
- [x] **VOICE-02**: Generation resolves brand voice by `clientProfileId`, not campaign name string matching.
- [x] **VOICE-03**: Existing Cenbrap voice is seeded into DB config for the Cenbrap `clientProfileId` with parity to current output.
- [x] **VOICE-04**: `resolveClientVoice` hardcode path is removed or reduced to deprecated fallback after migration.
- [x] **VOICE-05**: Owner can view active voice configuration for any `clientProfileId` without editing freeform constitution text.

### Corpus Learning Loop (LEARN)

- [x] **LEARN-01**: System aggregates global corpus evaluations into client-scoped learning proposals when slice thresholds are met (≥3 evals, |delta|≥15).
- [x] **LEARN-02**: Proposals are deduped to one active `proposed` slice per `(workspaceId, clientProfileId, sliceKey)`.
- [x] **LEARN-03**: Owner can list pending client learning proposals filtered by workspace and `clientProfileId`.
- [x] **LEARN-04**: Owner can accept a proposal, creating an approved `calibration_rule` with category `corpus_quality` and evidence refs.
- [x] **LEARN-05**: Owner can reject a proposal with required reason and 30-day cooldown.
- [x] **LEARN-06**: `factual_issue` failure reason never becomes a prompt rule; it surfaces as admin alert only.

### Prompt Application (APPLY)

- [x] **APPLY-01**: Next derivation for a `clientProfileId` loads approved brand-taste and `corpus_quality` rules for that profile only.
- [x] **APPLY-02**: Prompt-builder injects sections in order: Olhar ADScale → brand-taste → corpus_quality.
- [x] **APPLY-03**: Generation log records `appliedBrandRuleIds` and `appliedCorpusRuleIds` for each derivation.
- [x] **APPLY-04**: Active `corpus_quality` rules per `clientProfileId` are capped (default 10) with deprecation of oldest on overflow.
- [x] **APPLY-05**: Rules from one `clientProfileId` never appear in another profile's prompt (integration-tested).

### Owner Calibration Panel (PANEL)

- [ ] **PANEL-01**: Owner can select a `clientProfileId` and view its brand taste profile (patterns, evidence level, caveats).
- [ ] **PANEL-02**: Owner can view approved and pending calibration rules for the selected brand.
- [ ] **PANEL-03**: Owner can accept or reject client learning proposals from the same panel.
- [ ] **PANEL-04**: Panel shows source composition and blocks misleading "fully calibrated" copy when evidence is fixture-only.
- [ ] **PANEL-05**: Non-owner users cannot access brand calibration panel routes or APIs.

### Per-Brand Evidence Gate (EVIDENCE)

- [ ] **EVIDENCE-01**: Each brand profile exposes evidence level (`uncalibrated`, `seed_calibrated`, `assisted`, `evidence_backed`) from decision/evaluation count and source composition.
- [ ] **EVIDENCE-02**: Per-brand claims matrix blocks customer-real and quality-improvement claims when sample or source gates fail.
- [ ] **EVIDENCE-03**: Evidence report names exact missing conditions per `clientProfileId` when status is insufficient.
- [ ] **EVIDENCE-04**: Fixture-only brands always carry explicit caveat in profile and panel UI.
- [ ] **EVIDENCE-05**: Tests cover evidence withholding for fixture-only vs mixed-source brands.

### Global Cross-Client Promotion (GLOBAL)

- [ ] **GLOBAL-01**: When the same `primaryFailureReason` has approved `corpus_quality` rules in ≥2 distinct `clientProfileId`s with ≥6 total evaluations, system proposes global `rubric_calibration_adjustments`.
- [ ] **GLOBAL-02**: Global proposals require source composition gate (≥1 `real_customer` or `operator_imported`) or are flagged `fixture_only`.
- [ ] **GLOBAL-03**: Owner can accept global adjustment via existing calibration-adjustments accept flow with links to supporting client rules.
- [ ] **GLOBAL-04**: Global adjustments never auto-accept; rejected global proposals require reason.
- [ ] **GLOBAL-05**: Global promotion does not bypass per-brand isolation in prompt application.

## Future Requirements

### Workspace Admin Calibration (deferred)

- **ADMIN-01**: Workspace admin can view (read-only) brand taste profile for their client profiles.
- **ADMIN-02**: Workspace admin can request rule review from platform owner.

### Freeform Voice Editor (deferred)

- **EDITOR-01**: Owner can edit structured olhar constitution fields beyond seed template.

### Auto-Prioritization (deferred)

- **AUTO-01**: System auto-prioritizes corpus items for brands with `uncalibrated` evidence level.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Freeform voice constitution editor | User chose profile+rules only; risks prompt drift |
| Auto-approve learning proposals | Human authority before generation impact |
| Workspace admin / end-user calibration UI | Owner-only milestone |
| Regenerate on `intent=regenerate` | Explicitly out of corpus-learning-loop v1 |
| Fine-tuning / image model training | Prompt constraints prove value first |
| Commercial quality claims without real_customer sample | Evidence gate honesty |
| Replacing Olhar ADScale global constitution | Per-brand overlay only |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| VOICE-01 | Phase 162 | Complete |
| VOICE-02 | Phase 162 | Complete |
| VOICE-03 | Phase 162 | Complete |
| VOICE-04 | Phase 162 | Complete |
| VOICE-05 | Phase 162 | Complete |
| LEARN-01 | Phase 163 | Complete |
| LEARN-02 | Phase 163 | Complete |
| LEARN-03 | Phase 163 | Complete |
| LEARN-04 | Phase 163 | Complete |
| LEARN-05 | Phase 163 | Complete |
| LEARN-06 | Phase 163 | Complete |
| APPLY-01 | Phase 164 (164-01) | Complete |
| APPLY-02 | Phase 164 (164-01) | Complete |
| APPLY-03 | Phase 164 (164-01) | Complete |
| APPLY-04 | Phase 164 (164-02) | Complete |
| APPLY-05 | Phase 164 (164-03) | Complete |
| PANEL-01 | Phase 165 | Pending |
| PANEL-02 | Phase 165 | Pending |
| PANEL-03 | Phase 165 | Pending |
| PANEL-04 | Phase 165 | Pending |
| PANEL-05 | Phase 165 | Pending |
| EVIDENCE-01 | Phase 166 | Pending |
| EVIDENCE-02 | Phase 166 | Pending |
| EVIDENCE-03 | Phase 166 | Pending |
| EVIDENCE-04 | Phase 166 | Pending |
| EVIDENCE-05 | Phase 166 | Pending |
| GLOBAL-01 | Phase 167 | Pending |
| GLOBAL-02 | Phase 167 | Pending |
| GLOBAL-03 | Phase 167 | Pending |
| GLOBAL-04 | Phase 167 | Pending |
| GLOBAL-05 | Phase 167 | Pending |

**Coverage:**
- v13.2 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-23*
*Last updated: 2026-06-23 after roadmap Phases 162-167*
