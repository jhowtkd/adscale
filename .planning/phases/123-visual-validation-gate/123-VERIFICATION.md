---
phase: 123-visual-validation-gate
verified: 2026-06-15T20:55:44.555Z
status: gaps_found
---

# Phase 123: Visual Validation Gate Verification Report

**Phase Goal:** Milestone fecha com evidência visual controlada de que o pipeline corrigido atinge metas de qualidade e fidelidade factual antes do release.

**seedSupported:** false (OpenAI image API lacks deterministic seed)
**promptHash:** `f34a20ac179fdba3704b968f38af0f39792e5667`
**capturedAt:** 2026-06-15T20:48:03.340Z

## Aggregate Scores

| Metric | Value | Threshold | Met |
|---|---:|---:|:---:|
| meanQualityScore | 43.33 | ≥75 | ✗ |
| factualFidelityRate | 0.667 (4/6) | ≥0.95 | ✗ |

## Requirement Evidence

| Requirement | Result | Automated Command | Notes |
|---|---|---|---|
| QA-18 | pass | `node app/scripts/check-creative-validation-evidence.mjs --stage before && --stage after` | 6/6 paired matrix keys |
| QA-19 | gaps_found | `node app/scripts/check-creative-validation-evidence.mjs --stage final` | meanQualityScore=43.33 (≥75); factualFidelityRate=0.667 (≥0.95) |
| QA-20 | gaps_found | `node app/scripts/check-creative-validation-evidence.mjs --stage final` | 2 after capture(s) with fidelity hard failures |
| QA-21 | gaps_found | `cd app && node scripts/run-creative-release-gate.mjs` | test/lint/build pass; final evidence check failed on committed captures |

## Gaps Found

- **QA-19:** meanQualityScore=43.33 (≥75); factualFidelityRate=0.667 (≥0.95)
- **QA-20:** 2 after capture(s) with fidelity hard failures
- **QA-21:** test/lint/build pass; final evidence check failed on committed captures

## Goal-Backward Conclusion

Evidence infrastructure complete; committed after captures do not yet meet QA-19/QA-20 quality and fidelity thresholds. Operator regeneration required before milestone closure.
