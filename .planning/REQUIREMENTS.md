# Requirements: ADScale v12.6 Operacao Live do Corpus de Qualidade

**Defined:** 2026-06-17
**Milestone:** v12.6 Operacao Live do Corpus de Qualidade
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Transformar a infraestrutura de qualidade de v12.5 em uma rotina operacional real: selecionar outputs de campanhas reais, avaliar com julgamento humano estruturado, calcular tendencias apenas quando houver amostra suficiente e fechar release gates que separem green tecnico de evidencia live.

**Starting point:** v12.5 fechou com `real-quality-release-gate --run-regression` verde, mas o audit registrou `evaluatedItemCount=0` no corpus live e QA-24 fechou por `accepted_gap`, nao por cruzar a meta humana.

**In scope:** rotina de selecao e avaliacao live, playbook de reviewer, politica de amostragem, tendencias owner-facing, rerun aggregate dos CLIs 130/131/132/133 e release evidence operacional.

**Out of scope:** terceirizar avaliadores, fine-tuning, mudar modelo de imagem, performance-media blending completo, claims comerciais de melhoria antes de suficiencia estatistica.

## Requirements

### Live Corpus Operations (LIVEQUAL)

- [ ] **LIVEQUAL-01**: Operator can select a controlled weekly batch of real generated outputs into the live quality corpus from eligible campaigns.
- [ ] **LIVEQUAL-02**: Operator can track review queue progress by workspace, campaign, generation mode, format, cohort and reviewer status.
- [ ] **LIVEQUAL-03**: Reviewer can evaluate corpus items through a fast, repeatable flow with visual score, factual pass/fail, intent and visible failure reason.
- [ ] **LIVEQUAL-04**: Corpus operations reject unsafe artifacts and never persist raw prompts, signed URLs, secrets or unbounded model payloads.

### Sampling and Sufficiency (SAMPLE)

- [ ] **SAMPLE-01**: System defines minimum sample thresholds per quality trend, calibration slice and learning-impact slice.
- [ ] **SAMPLE-02**: Reports return `insufficient_sample` with required-next-sample guidance when thresholds are not met.
- [ ] **SAMPLE-03**: Release evidence distinguishes fixture metrics, live human metrics and accepted caveats without mixing denominators.
- [ ] **SAMPLE-04**: Operator can see which slices need more samples before the next release gate can make a stronger claim.

### Quality Trend Dashboard (TREND)

- [ ] **TREND-01**: Owner can view live human quality trend, factual pass rate and learning-impact status over time.
- [ ] **TREND-02**: Owner can filter trends by workspace, mode, format, client profile and visible failure reason.
- [ ] **TREND-03**: Dashboard flags regressions, stale evidence and insufficient live corpus coverage separately.
- [ ] **TREND-04**: Dashboard links each aggregate back to bounded corpus evidence for auditability.

### Operational Release Gate (QALIVE)

- [ ] **QALIVE-01**: Release gate reruns score calibration, learning impact, quality improvement and real-quality aggregate against live evidence.
- [ ] **QALIVE-02**: Gate passes technical regression independently from operational-evidence status.
- [ ] **QALIVE-03**: Milestone cannot claim quality improvement unless live human metrics meet sample sufficiency and factual pass remains 1.0.
- [ ] **QALIVE-04**: Release audit records exact commands, live sample counts, accepted caveats and next operator action.

## Future Requirements

### Performance Blending (deferred)

- **PERFOUT-01**: Combine human quality learnings with imported CTR/CPA/ROAS once live corpus and performance samples are both sufficient.
- **PERFOUT-02**: Reweight recommendations by media outcome without weakening factual and human-quality gates.

### Reviewer Scale (deferred)

- **REVIEWOPS-01**: Multiple reviewers can evaluate the same item and measure inter-reviewer agreement.
- **REVIEWOPS-02**: External reviewer permissions can be isolated from workspace data.

## Out of Scope

| Feature | Reason |
|---------|--------|
| External reviewer marketplace | Operational and privacy scope is too large before internal live loop works |
| Fine-tuning image generation models | Premature; first prove real corpus trend and failure taxonomy |
| Commercial quality claims | Blocked until live sample sufficiency and factual pass are proven |
| Full performance blending | Depends on enough real performance rows and stable live quality corpus |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LIVEQUAL-01 | Phase 134 | Pending |
| LIVEQUAL-02 | Phase 134 | Pending |
| LIVEQUAL-03 | Phase 134 | Pending |
| LIVEQUAL-04 | Phase 134 | Pending |
| SAMPLE-01 | Phase 135 | Pending |
| SAMPLE-02 | Phase 135 | Pending |
| SAMPLE-03 | Phase 135 | Pending |
| SAMPLE-04 | Phase 135 | Pending |
| TREND-01 | Phase 136 | Pending |
| TREND-02 | Phase 136 | Pending |
| TREND-03 | Phase 136 | Pending |
| TREND-04 | Phase 136 | Pending |
| QALIVE-01 | Phase 137 | Pending |
| QALIVE-02 | Phase 137 | Pending |
| QALIVE-03 | Phase 137 | Pending |
| QALIVE-04 | Phase 137 | Pending |

**Coverage:**
- v12.6 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-06-17 after v12.6 milestone initialization*
