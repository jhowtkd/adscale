# Requirements: ADScale v13.3 Tracao Multi-Cliente

**Defined:** 2026-06-25
**Milestone:** v13.3 Tracao Multi-Cliente
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Corrigir a direcao pos-v13.2 para que ADScale prove tracao de produto de forma cliente-agnostica. Cenbrap permanece como seed/fixture de compatibilidade, nunca como cliente-modelo ou claim principal.

**Starting point:** v13.2 generalizou a infraestrutura de calibracao por `clientProfile`, mas os carry-forwards ainda falam demais em Cenbrap e parte do valor segue owner-only. Este milestone transforma a infraestrutura em fluxo usavel para qualquer cliente real, com narrativa clara, dados reais e chao de produto confiavel.

**In scope:** entrada generica de decisoes humanas por `clientProfile`, import/captura de corpus real com source labels, claims gate por marca, rollout "Curator > operator" no app, settings persistentes e UI de factual alerts.

**Out of scope:** tratar Cenbrap como objetivo de produto, aprovar/depreciar regras manualmente, fila de incerteza automatica, dashboard multi-marca profundo, competitor analysis, smart resize preview, performance learnings no prompt e integracoes Meta/Google/TikTok.

## Requirements

### Client-Agnostic Human Decisions (DECISION)

- [ ] **DECISION-01**: Owner can record a human creative judgment for any eligible corpus or derivation item scoped to a `clientProfileId`, independent of Cenbrap.
- [x] **DECISION-02**: Decision capture writes canonical calibration evidence with workspace, `clientProfileId`, source label, reviewer, reviewedAt, verdict and rationale.
- [ ] **DECISION-03**: The UI copy and data model describe Cenbrap rows as seed/fixture compatibility data, not as product proof.
- [x] **DECISION-04**: Decision evidence updates the per-brand evidence report without requiring brand-specific scripts.
- [x] **DECISION-05**: Tests prove decisions for one `clientProfileId` cannot affect another profile's evidence, rules or prompt context.

### Real Corpus and Claims (SOURCE)

- [ ] **SOURCE-01**: Owner can import or promote real customer/operator corpus rows for any `clientProfileId` with explicit `sourceLabel`.
- [ ] **SOURCE-02**: Source composition separates `synthetic_fixture`, `operator_imported` and `real_customer` in every customer-facing or owner-facing evidence surface.
- [ ] **SOURCE-03**: Customer-real, agreement-rate and quality-improvement claims stay withheld until the selected brand meets sample and source sufficiency.
- [ ] **SOURCE-04**: Fixture-only evidence can validate operation but cannot unlock external claims, regardless of whether the fixture is Cenbrap.
- [ ] **SOURCE-05**: Release evidence reports both technical status and operational evidence status for the active brand sample.

### Product Narrative Rollout (BRAND)

- [ ] **BRAND-01**: Approved "Curator > operator" positioning is reflected in authenticated app copy where users make workflow decisions.
- [ ] **BRAND-02**: Onboarding and empty states explain the curator role without referencing Cenbrap or internal calibration mechanics.
- [ ] **BRAND-03**: Navigation, labels and call-to-action copy use consistent product language across campaign creation, generation, review and settings.
- [ ] **BRAND-04**: Brand rollout has a review checklist so copy changes do not overclaim automation, performance lift or customer-real proof.

### Product Trust Baseline (TRUST)

- [ ] **TRUST-01**: Profile settings persist through the backend instead of local store timeout simulation.
- [ ] **TRUST-02**: Workspace settings persist through the backend and survive refresh, logout/login and device changes.
- [ ] **TRUST-03**: Disabled settings tabs are either backed by real APIs or hidden behind honest unavailable states.
- [ ] **TRUST-04**: Settings save/error/loading states are deterministic and tested.
- [ ] **TRUST-05**: Existing brand kit, team, billing and privacy settings continue to work after profile/workspace persistence changes.

### Operational Evidence UI (ALERT)

- [ ] **ALERT-01**: Owner can see factual issue alerts from the existing factual-alerts API in the quality/admin UI.
- [ ] **ALERT-02**: Factual issue alerts link to the relevant workspace, `clientProfileId`, slice and evidence summary without exposing prompts or storage keys.
- [ ] **ALERT-03**: Alert UI distinguishes factual issues from promptable corpus-quality rules, preventing accidental rule creation.
- [ ] **ALERT-04**: The release checklist covers the new decision, source, brand, settings and alert surfaces.

## Future Requirements

### Calibration Operations (deferred)

- **RULES-01**: Owner can approve candidate calibration rules from the brand rules panel.
- **RULES-02**: Owner can deprecate approved calibration rules with audit trail.
- **QUEUE-01**: System routes high-uncertainty outputs into human review and skips low-uncertainty calibrated outputs.
- **DASH-01**: Owner can compare evidence health across many brands from `/admin/quality`.
- **VOICE-EDIT-01**: Owner can edit structured voice/Olhar configuration beyond read-only inspect.

### Creative Expansion (deferred)

- **COMP-01**: Campaign UI exposes competitor analysis and strategy generation.
- **RESIZE-01**: Campaign UI exposes smart resize preview for platform crops.
- **PERF-01**: Performance learnings influence derivation prompts.

### Distribution and Compliance (deferred)

- **INTEG-01**: Meta, Google and TikTok integrations support real OAuth and export workflows.
- **A11Y-01**: Known color-contrast exception `DEFECT-CONTRAST` is removed from the visual a11y gate.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Cenbrap-specific milestone objective | Cenbrap is a fixture/seed, not the product model |
| Manual approve/deprecate rule governance | Valuable after real multi-client evidence exists; not first tracao slice |
| Uncertainty queue automation | Needs real operating data before automation is useful |
| Multi-brand evidence dashboard | Defer until generic decision/source flow produces enough brands to compare |
| Competitor analysis UI | Feature axis before narrative/data foundation is premature |
| Smart resize preview UI | Useful later, but not needed to correct customer-agnostic product proof |
| Performance learnings in prompt | Bigger creative-learning axis; defer until tracao foundation is stable |
| Meta/Google/TikTok integrations | Large OAuth/distribution surface, better suited for v14+ |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| DECISION-01 | Phase 168 | Pending |
| DECISION-02 | Phase 168 | Complete |
| DECISION-03 | Phase 168 | Pending |
| DECISION-04 | Phase 168 | Complete |
| DECISION-05 | Phase 168 | Complete |
| SOURCE-01 | Phase 169 | Pending |
| SOURCE-02 | Phase 169 | Pending |
| SOURCE-03 | Phase 169 | Pending |
| SOURCE-04 | Phase 169 | Pending |
| SOURCE-05 | Phase 169 | Pending |
| BRAND-01 | Phase 170 | Pending |
| BRAND-02 | Phase 170 | Pending |
| BRAND-03 | Phase 170 | Pending |
| BRAND-04 | Phase 170 | Pending |
| TRUST-01 | Phase 171 | Pending |
| TRUST-02 | Phase 171 | Pending |
| TRUST-03 | Phase 171 | Pending |
| TRUST-04 | Phase 171 | Pending |
| TRUST-05 | Phase 171 | Pending |
| ALERT-01 | Phase 172 | Pending |
| ALERT-02 | Phase 172 | Pending |
| ALERT-03 | Phase 172 | Pending |
| ALERT-04 | Phase 172 | Pending |

**Coverage:**
- v13.3 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after client-agnostic milestone reset*
