# Requirements: ADScale v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo

**Defined:** 2026-06-17
**Milestone:** v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Transformar o learning loop de v12.4 em evidencia real de qualidade percebida. A milestone deve medir outputs reais com julgamento humano estruturado, calibrar o score automatico contra esse julgamento, provar impacto dos learnings aplicados e atacar os padroes visuais que mantiveram o gap aceito de v12.3 (`meanQualityScore 70.17 < 75`).

**Starting point:** v12.4 passou com `qualityImprovementPathRate=1.0` e `safetyGuardPassRate=1.0`, mas o audit aceitou que o ganho de qualidade foi fixture-based e que o gap visual de v12.3 ainda nao foi fechado em corpus live.

**In scope:** corpus live versionado, avaliacao humana estruturada, calibracao score vs julgamento humano, medicionamento de impacto dos learnings, melhorias focadas em qualidade visual, release gate com evidencia reproduzivel.

**Out of scope:** fine-tuning, julgamento humano terceirizado/externo, mudancas livres de prompt sem contrato, ranking automatico por performance de midia, deploy/prod smoke nao relacionado ao corpus.

## Requirements

### Human Quality Corpus (HUMAN)

- [x] **HUMAN-01**: Operator can select real generated outputs into a versioned quality evaluation corpus with workspace, campaign, derivation, mode and format scope.
- [x] **HUMAN-02**: Each corpus item stores bounded artifact references and evaluation metadata without raw prompts, signed URLs, auth material or unbounded model payloads.
- [x] **HUMAN-03**: Reviewer can record structured human judgment: visual score, factual pass/fail, approve/reject/regenerate intent, and primary visible failure reason.
- [x] **HUMAN-04**: Corpus can distinguish baseline, pre-learning and post-learning samples so quality movement is measurable over time.

### Score Calibration (CALIB)

- [x] **CALIB-01**: Automatic quality score can be compared against human visual score for every evaluated corpus item.
- [x] **CALIB-02**: Calibration report identifies systematic divergences by failure type, mode and format.
- [x] **CALIB-03**: Gate/rubric adjustments are versioned and backed by corpus evidence instead of anecdotal judgment.
- [x] **CALIB-04**: Factual fidelity remains measured separately from visual quality and cannot be traded away for higher visual score.

### Learning Impact (IMPACT)

- [x] **IMPACT-01**: System can measure whether v12.4 output-learning recommendation/prefill was applied for a generated sample.
- [x] **IMPACT-02**: Evaluation separates learned outputs from non-learned comparable outputs by client, mode and format.
- [x] **IMPACT-03**: Impact report measures rejection/regeneration intent, human visual score movement and factual pass rate.
- [x] **IMPACT-04**: If evidence is insufficient, report returns an honest insufficient-sample state instead of claiming improvement.

### Creative Improvement (QUALITY)

- [x] **QUALITY-01**: Overload, weak hierarchy, generic template feel, illegible CTA and unfocused composition are represented as first-class visible failure reasons.
- [x] **QUALITY-02**: Prompt/gate/rubric changes target only failure reasons proven by corpus evidence.
- [ ] **QUALITY-03**: Visual quality changes preserve v12.3 hard factual protections and v12.4 learning safety guards.
- [ ] **QUALITY-04**: Improved outputs can be re-evaluated against the same corpus dimensions to show whether the targeted failure decreased.

### Release Evidence (QA)

- [ ] **QA-22**: Milestone release gate runs focused corpus/evaluation tests, score calibration checks, v12.3 factual subset, v12.4 output-learning subset, `npm test`, `npm run lint`, and `npm run build`.
- [ ] **QA-23**: Release evidence stores quality metrics, factual metrics, learning-impact metrics and accepted caveats in separate sections.
- [ ] **QA-24**: Milestone cannot close as passed unless factual pass rate remains 1.0 and either human visual quality crosses the target or the remaining gap is smaller and explicitly accepted.

## Future Requirements

### Live Product Rollout (deferred)

- **LIVEQUAL-01**: Beta operators can run the evaluation workflow directly in production with controlled reviewer permissions.
- **LIVEQUAL-02**: Owner dashboard shows trend lines for human quality score and learning impact over time.

### Performance Blending (deferred)

- **PERFOUT-01**: Combine human output quality learnings with imported media performance once enough real performance data exists.
- **PERFOUT-02**: Reweight output learnings by CTR/CPA/ROAS impact without losing factual and human-quality guardrails.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Fine-tuning image models | Costly and premature; first prove measurable product-loop improvement |
| External reviewer marketplace | Operational complexity; this milestone needs an internal/operator corpus first |
| Mem0 as quality source of truth | v12.4 established Postgres canonical truth; retrieval remains projection |
| Freeform prompt mutation from learnings | Hard to audit and likely to regress factual protections |
| Media performance blending | Valuable later, but this milestone is about human output quality |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HUMAN-01 | Phase 129 | Complete |
| HUMAN-02 | Phase 129 | Complete |
| HUMAN-03 | Phase 129 | Complete |
| HUMAN-04 | Phase 129 | Complete |
| CALIB-01 | Phase 130 | Complete |
| CALIB-02 | Phase 130 | Complete |
| CALIB-03 | Phase 130 | Complete |
| CALIB-04 | Phase 130 | Complete |
| IMPACT-01 | Phase 131 | Complete |
| IMPACT-02 | Phase 131 | Complete |
| IMPACT-03 | Phase 131 | Complete |
| IMPACT-04 | Phase 131 | Complete |
| QUALITY-01 | Phase 132 | Complete |
| QUALITY-02 | Phase 132 | Complete |
| QUALITY-03 | Phase 132 | Pending |
| QUALITY-04 | Phase 132 | Pending |
| QA-22 | Phase 133 | Pending |
| QA-23 | Phase 133 | Pending |
| QA-24 | Phase 133 | Pending |

**Coverage:**
- v12.5 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-06-17 after v12.5 milestone initialization*
