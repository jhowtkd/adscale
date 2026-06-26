# Requirements: ADScale v13.7 Qualidade Operacional das Jornadas Guiadas

**Defined:** 2026-06-26
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Milestone Scope

Transformar as jornadas guiadas do `/assistant` em operação mensurável e melhorável. A v13.7 parte da v13.6 já implementada (`Já tenho peça` e `Produzir do zero`) e fecha a lacuna entre "funciona tecnicamente" e "tem evidência operacional de que conduz o usuário à próxima ação útil".

**In scope:** telemetria por fluxo/etapa, funil operacional, staging runbook com artefatos seguros, feedback humano sobre utilidade de diagnóstico/plano, release gate que separa implementação verde de qualidade observada.

**Out of scope:** novo fluxo guiado, geração automática sem confirmação, mudar motor de IA, dashboard analítico avançado público, claims customer-real sem amostra suficiente, aplicação automática de aprendizados em prompt sem revisão humana.

## v13.7 Requirements

### Journey Telemetry

- [x] **TEL-01**: System records guided-flow lifecycle events for start, step view, required input supplied, blocked action, action proposed, action confirmed, failure and completion.
- [x] **TEL-02**: Telemetry is scoped by workspace, clientProfile, assistant thread, path and step without storing provider reasoning, signed URLs, raw tool args or prompt payloads.
- [x] **TEL-03**: Telemetry distinguishes `existing_creative` and `from_zero` paths and records safe blocker categories such as missing asset, missing references, missing brief fields and action failure.
- [x] **TEL-04**: Telemetry can be queried deterministically for a time window, workspace/clientProfile and path without cross-workspace leakage.

### Operational Funnel

- [ ] **FUN-01**: Owner/internal users can view guided journey starts, completions, abandonment and failure counts by path.
- [ ] **FUN-02**: Owner/internal users can inspect step-level drop-off and top blocker categories for `Já tenho peça` and `Produzir do zero`.
- [ ] **FUN-03**: Funnel reporting separates automated implementation coverage from real operational evidence and sample sufficiency.
- [ ] **FUN-04**: Funnel output includes enough links or ids to investigate affected threads without exposing sensitive payloads.

### Staging Evidence

- [ ] **STG-01**: A staging runbook defines the exact human checks for live diagnosis, auto-briefing, creative plan and campaign approval lifecycle.
- [ ] **STG-02**: Staging evidence can be recorded as a structured artifact with reviewer, environment, path, thread/campaign references, verdict and safe notes.
- [ ] **STG-03**: Staging evidence explicitly covers one `Já tenho peça` journey with a real asset and one `Produzir do zero` journey with at least 3 references.
- [ ] **STG-04**: Staging evidence marks provider/live failures as blockers or accepted tech debt without changing implementation requirement status.

### Human Quality Feedback

- [ ] **QFB-01**: Operator can rate whether a diagnosis was useful, incomplete or misleading with a short safe reason.
- [ ] **QFB-02**: Operator can rate whether a from-zero creative plan was generation-ready, partially useful or unusable with a short safe reason.
- [ ] **QFB-03**: Feedback is attached to guided-flow path, step and thread context without exposing prompts, provider reasoning or signed URLs.
- [ ] **QFB-04**: Feedback is read-only operational evidence in this milestone and does not automatically alter prompts, calibration rules or generation behavior.

### Release Gate

- [ ] **GATE-01**: Release gate reports implementation status, automated test status, staging evidence status and operational sample sufficiency separately.
- [ ] **GATE-02**: Release gate blocks or warns on missing staging evidence for diagnosis/briefing and live lifecycle verification.
- [ ] **GATE-03**: Release gate blocks customer-real quality claims when sample size or source composition is insufficient.
- [ ] **GATE-04**: Milestone audit can cite the release gate artifact and distinguish shipped implementation, accepted tech debt and claims still blocked.

## Future Requirements

### Advanced Optimization

- **OPT-01**: Assistant can adapt question order based on observed drop-off by path and client segment.
- **OPT-02**: Assistant can suggest prompt/calibration changes from repeated diagnosis or plan feedback.
- **OPT-03**: Owner can compare guided-flow performance across cohorts, acquisition channels and client profiles.
- **OPT-04**: Product can A/B test journey entry copy and step ordering.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New guided journey beyond the two v13.6 paths | v13.7 proves and improves operational quality before expanding surface area. |
| Automatic prompt or calibration mutation from feedback | Feedback must be reviewed before it changes generation behavior. |
| Public customer analytics dashboard | This milestone is internal/owner operational evidence, not customer reporting. |
| Customer-real quality claims | Require sufficient real sample/source evidence beyond basic implementation success. |
| Replacing existing campaign/review surfaces | Guided chat should hand off safely to mature surfaces where appropriate. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEL-01 | Phase 190 | Complete |
| TEL-02 | Phase 190 | Complete |
| TEL-03 | Phase 190 | Complete |
| TEL-04 | Phase 190 | Complete |
| FUN-01 | Phase 191 | Pending |
| FUN-02 | Phase 191 | Pending |
| FUN-03 | Phase 191 | Pending |
| FUN-04 | Phase 191 | Pending |
| STG-01 | Phase 192 | Pending |
| STG-02 | Phase 192 | Pending |
| STG-03 | Phase 192 | Pending |
| STG-04 | Phase 192 | Pending |
| QFB-01 | Phase 193 | Pending |
| QFB-02 | Phase 193 | Pending |
| QFB-03 | Phase 193 | Pending |
| QFB-04 | Phase 193 | Pending |
| GATE-01 | Phase 194 | Pending |
| GATE-02 | Phase 194 | Pending |
| GATE-03 | Phase 194 | Pending |
| GATE-04 | Phase 194 | Pending |

**Coverage:**
- v13.7 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-06-26 after v13.7 milestone creation*
