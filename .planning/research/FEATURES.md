# Feature Research

**Domain:** Creative performance capture, comparison and reusable client learning
**Researched:** 2026-06-12
**Confidence:** HIGH for workflow; MEDIUM for statistical thresholds pending real data

## Feature Landscape

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Manual metric entry | Users need a path when exports are unavailable | LOW | Campaign + derivation + date window + platform |
| CSV upload with mapping preview | Provider exports vary in naming and locale | MEDIUM | Map required canonical columns; show invalid rows before save |
| Canonical raw metrics | Comparisons require shared definitions | MEDIUM | Impressions, clicks, spend, conversions, conversion value |
| Derived metrics | Users expect CTR, CPC, CPA and ROAS | LOW | Compute from raw fields; do not trust contradictory imported ratios |
| Creative hypothesis | Results are meaningless without the intended change | MEDIUM | One primary variable, expected effect, primary metric |
| Variant comparison | Core job is understanding what worked | MEDIUM | Comparable window/platform/objective; allow no clear winner |
| Import history and correction | Performance data changes with attribution delay | MEDIUM | Batch audit, row source, re-import/upsert and delete controls |
| Workspace/client isolation | Performance data is commercially sensitive | MEDIUM | Every lookup scoped by workspace and client profile |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Evidence-backed client memory | Turns campaigns into reusable strategy, not isolated reports | HIGH | Pattern cards cite supporting campaigns/derivations and sample size |
| Confidence-aware recommendations | Prevents confident advice from sparse data | HIGH | `insufficient`, `directional`, `strong`; always explain why |
| Next experiment launcher | Converts learning into action inside the existing cockpit | MEDIUM | Prefill campaign/recipe/CTA/format while preserving user control |
| Prediction vs outcome | Measures whether creative hypotheses and readiness scores are useful | MEDIUM | Compare expected metric/direction with observed result |
| Learning contradictions | Shows when a pattern stopped working or differs by platform | HIGH | Segment by platform/objective/time and retain contradictory evidence |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic universal winner | Simple headline | Asset ratios are contextual and can be biased by delivery | Winner only within comparable cohort; otherwise directional/no winner |
| AI recommendation without citations | Feels intelligent | Hallucination and untraceable advice | Deterministic evidence packet, optional AI wording |
| Import every provider column | Avoid mapping decisions | Produces unstable schema and unusable UI | Canonical core metrics plus source metadata |
| Cross-client benchmark by default | More data | Privacy and context leakage | Client-first memory; anonymized benchmarks only in a future consented model |
| Automatic publishing/budget changes | Closes the loop | High operational and financial risk | User-confirmed next experiment only |

## Feature Dependencies

```text
Canonical metric model
    -> manual entry + CSV mapping
        -> comparable performance snapshots
            -> variant comparison
                -> client learning memory
                    -> next-experiment recommendation

Creative hypothesis -> comparison interpretation
Import audit/idempotency -> trustworthy memory
```

## MVP Definition

### Launch With (v12.1)

- [ ] Canonical performance record with source, date window and derivation association
- [ ] Manual entry and CSV mapping/preview with row-level errors
- [ ] Hypothesis capture with one primary variable and metric
- [ ] Comparable variant table with `no clear winner` support
- [ ] Client learning cards with evidence links and confidence level
- [ ] Next experiment recommendation that can prefill an existing creation flow
- [ ] Regression, workspace isolation, auditability and operator UAT

### Add After Validation

- [ ] Saved provider mapping templates — after repeated exports prove stable column patterns
- [ ] Scheduled imports — after manual import frequency becomes operational friction
- [ ] Learning decay/recency weighting — after enough longitudinal history exists
- [ ] Optional AI narrative — after deterministic evidence packets are trusted

### Future Consideration

- [ ] Direct ad-platform APIs
- [ ] Cross-client anonymized benchmarks
- [ ] Multi-touch attribution
- [ ] Automated media changes

## Feature Prioritization Matrix

| Feature | User Value | Cost | Priority |
|---------|------------|------|----------|
| Canonical metrics + audit | HIGH | MEDIUM | P1 |
| Manual/CSV ingestion | HIGH | MEDIUM | P1 |
| Hypothesis + comparable variants | HIGH | MEDIUM | P1 |
| Evidence-backed client memory | HIGH | HIGH | P1 |
| Next experiment launcher | HIGH | MEDIUM | P1 |
| Saved mappings | MEDIUM | MEDIUM | P2 |
| Direct APIs | HIGH | HIGH | P3 |

## Research Interpretation

- Google Ads defines CTR from raw clicks/impressions; derived metrics should be recalculated from canonical inputs.
- Google Ads warns that asset-level CTR/CPC/CPA/ROAS are directional because delivery context influences them.
- Google and Meta experiment guidance emphasizes changing one variable and allowing `no clear winner` when evidence is insufficient.
- Therefore v12.1 should distinguish observed performance, comparable experiment evidence, and inferred client patterns.

## Sources

- https://support.google.com/google-ads/answer/2615875 — CTR definition
- https://developers.google.com/google-ads/api/docs/api-policy/rmf — canonical reporting fields
- https://support.google.com/google-ads/answer/16259414 — asset-level ratios are directional
- https://support.google.com/google-ads/answer/6318747 — confidence intervals and no-clear-winner state
- https://support.google.com/google-ads/answer/13719071 — isolate one variable in experiments
- https://www.facebook.com/business/help/1738164643098669 — Meta A/B test variable comparison
- ADScale Phase 94 real-session learning evidence — existing learn-before-build precedent

---
*Feature research for: v12.1 Memória Criativa e Aprendizado de Performance*
*Researched: 2026-06-12*
