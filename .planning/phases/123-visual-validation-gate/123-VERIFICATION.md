---
phase: 123-visual-validation-gate
verified: 2026-06-16T17:55:26.082Z
status: gaps_found
---

# Phase 123: Visual Validation Gate Verification Report

**Phase Goal:** Milestone fecha com evidência visual controlada de que o pipeline corrigido atinge metas de qualidade e fidelidade factual antes do release.

**seedSupported:** false (OpenAI image API lacks deterministic seed)
**promptHash:** `f34a20ac179fdba3704b968f38af0f39792e5667`
**capturedAt:** 2026-06-16T17:50:07.855Z

## Aggregate Scores

| Metric | Value | Threshold | Met |
|---|---:|---:|:---:|
| meanQualityScore | 70.17 | ≥75 | ✗ |
| factualFidelityRate | 1.000 (6/6) | ≥0.95 | ✓ |

## Requirement Evidence

| Requirement | Result | Automated Command | Notes |
|---|---|---|---|
| QA-18 | pass | `node app/scripts/check-creative-validation-evidence.mjs --stage before && --stage after` | 6/6 paired matrix keys |
| QA-19 | gaps_found | `node app/scripts/check-creative-validation-evidence.mjs --stage final` | meanQualityScore=70.17 (<75); factualFidelityRate=1.000 (≥0.95) |
| QA-20 | pass | `node app/scripts/check-creative-validation-evidence.mjs --stage final` | zero fidelity hard failures on after set |
| QA-21 | pending | `cd app && node scripts/run-creative-release-gate.mjs` | npm test + lint + build + final evidence check |

## Gaps Found

- **QA-19:** meanQualityScore=70.17 (<75); factualFidelityRate=1.000 (≥0.95)

## Goal-Backward Conclusion

Evidence infrastructure complete; committed after captures meet factual fidelity (QA-20) but mean quality (QA-19) remains below threshold. Operator regeneration required before milestone closure.
