# Requirements: ADScale v11.5 Qualidade IA Orientada por Feedback

**Defined:** 2026-06-05
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v11.5 Requirements

### Creative Contracts and Prompts

- [x] **AIC-01**: Developer can inspect one explicit creative contract per derivation that includes generation mode, target format, CTA semantics, brand/client, product, offer, source assets, and factual-source rules.
- [x] **AIC-02**: Prompt builder tests prove art variation prompts preserve required information while allowing the selected creative level to change composition.
- [x] **AIC-03**: Prompt builder tests prove format adaptation prompts rearrange source creative modules into native target layouts instead of allowing blurred padding, cropped posters, or letterboxing.
- [x] **AIC-04**: Prompt builder tests prove restyling prompts treat the base image as factual source and the style reference as visual language only.
- [x] **AIC-05**: Generated derivations retain enough prompt provenance for debugging: input prompt, revised/generated prompt when available, creative contract, generation mode, target format, and source package.

### Scoring and QA Reliability

- [ ] **AIQ-01**: Scoring and QA use a shared quality taxonomy for legibility, CTA/offer preservation, information preservation, brief match, format fit, creative risk, style fidelity, and variation level fit.
- [ ] **AIQ-02**: Score/QA model outputs are schema-validated and normalized so missing or malformed fields cannot silently become misleading high-confidence results.
- [ ] **AIQ-03**: Hard failures are limited to contract-breaking issues: wrong/missing CTA, missing offer/product/brand, severe illegibility, invalid format layout, unsafe crop, and style-reference factual contamination.
- [ ] **AIQ-04**: Visual polish cannot hide contract failures; any hard failure forces an invalid quality verdict regardless of overall visual score.
- [ ] **AIQ-05**: User-facing QA explanations distinguish blocking failures from advisory polish suggestions in PT-BR and EN.

### Feedback-Informed Regeneration

- [ ] **AIR-01**: Regeneration suggestion builder combines hard failures, score issues, QA issues, and optional beta feedback category into one bounded correction brief.
- [ ] **AIR-02**: Regeneration never lets user/beta feedback override hard contract fields such as exact CTA, target format, generation mode, base factual source, brand, product, or offer.
- [ ] **AIR-03**: User can see the main reason for recommended regeneration before confirming, including the hard failures or QA issues it will try to fix.
- [ ] **AIR-04**: Regenerated derivations preserve parent/source context and record the correction brief used for the regeneration attempt.
- [ ] **AIR-05**: Regeneration route tests cover explicit feedback, stored regeneration suggestion, hard-failure suggestion, and feedback-informed correction context.

### Quality Fixtures and Verification

- [ ] **FIX-01**: Repository includes a synthetic or sanitized quality fixture set for known failure modes: wrong CTA, cropped text/logo, style-reference factual contamination, poor format adaptation, weak preservation, and low legibility.
- [ ] **FIX-02**: Automated tests cover prompt contract snapshots for art variation, format adaptation, and restyling.
- [ ] **FIX-03**: Automated tests cover score/QA normalization and hard failure classification for the known failure modes.
- [ ] **FIX-04**: Manual verification guide defines how to evaluate one complete quality loop: generation prompt, output, score, QA, hard failure, regeneration suggestion, and regenerated result.
- [ ] **FIX-05**: Final handoff documents residual limitations that remain model-dependent, especially text rendering, visual consistency, and precise composition.

## Future Requirements

| Requirement | Reason |
|-------------|--------|
| **AIF-FUT-01**: Automated multi-attempt regeneration loop | Defer until single regeneration suggestions are reliable and spend controls are explicit. |
| **AIF-FUT-02**: Model/provider migration or A/B model selection | Quality contracts and measurement should stabilize first. |
| **AIF-FUT-03**: Large-scale visual eval harness with real customer creatives | Requires data/privacy review and enough consented beta examples. |
| **AIF-FUT-04**: Owner dashboard analytics for quality trends | Useful after reports and fixture categories accumulate. |
| **AIF-FUT-05**: Fine-tuned/custom scoring model | Premature before taxonomy and fixtures are stable. |

## Out of Scope

| Feature | Reason |
|---------|--------|
| Switching the primary image model | The current quality issue is contract/scoring/regeneration alignment, not proven model inadequacy. |
| Infinite or automatic regeneration | Could burn credits and frustrate users; v11.5 keeps user-confirmed regeneration. |
| Blocking export for every warning | Only hard contract failures should block; polish suggestions remain advisory. |
| Passing raw beta feedback directly into prompts | Feedback must be sanitized/categorized and cannot override hard rules. |
| Public prompt/debug visibility for beta users | Prompt/contract debugging is internal/owner/developer context. |
| Using real customer assets as committed fixtures | Fixtures must be synthetic or explicitly sanitized. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AIC-01 | Phase 57 | Complete |
| AIC-02 | Phase 57 | Complete |
| AIC-03 | Phase 57 | Complete |
| AIC-04 | Phase 57 | Complete |
| AIC-05 | Phase 57 | Complete |
| AIQ-01 | Phase 58 | Pending |
| AIQ-02 | Phase 58 | Pending |
| AIQ-03 | Phase 58 | Pending |
| AIQ-04 | Phase 58 | Pending |
| AIQ-05 | Phase 58 | Pending |
| AIR-01 | Phase 59 | Pending |
| AIR-02 | Phase 59 | Pending |
| AIR-03 | Phase 59 | Pending |
| AIR-04 | Phase 59 | Pending |
| AIR-05 | Phase 59 | Pending |
| FIX-01 | Phase 60 | Pending |
| FIX-02 | Phase 60 | Pending |
| FIX-03 | Phase 60 | Pending |
| FIX-04 | Phase 60 | Pending |
| FIX-05 | Phase 60 | Pending |

**Coverage:**
- v11.5 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-06-05*
*Last updated: 2026-06-05 after v11.5 roadmap creation*
