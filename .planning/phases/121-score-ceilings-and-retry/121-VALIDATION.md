---
phase: 121
slug: score-ceilings-and-retry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 121 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts tests/unit/ai/derivation-auto-retry-policy.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~20 seconds (ceilings + retry subset) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts tests/unit/ai/derivation-auto-retry-policy.test.ts`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/ai/`
- **Before `$gsd-verify-work`:** Full suite must be green (`cd app && npm test && npm run lint && npm run build`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 121-01-01 | 01 | 1 | SCR-02 | unit | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts -t "invented"` | ❌ W0 | ⬜ pending |
| 121-01-02 | 01 | 1 | SCR-02, SCR-03 | unit | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts` | ❌ W0 | ⬜ pending |
| 121-01-03 | 01 | 1 | SCR-03 | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "capped score"` | ❌ W0 | ⬜ pending |
| 121-01-04 | 01 | 1 | SCR-01 | unit | `cd app && npm test -- tests/unit/ai/creative-score.test.ts -t "dimension"` | ❌ W0 | ⬜ pending |
| 121-02-01 | 02 | 2 | SCR-04 | unit | `cd app && npm test -- tests/unit/ai/derivation-auto-retry-policy.test.ts -t "restyling"` | ❌ W0 | ⬜ pending |
| 121-02-02 | 02 | 2 | SCR-04 | unit/integration | `cd app && npm test -- src/server/jobs/derivation.test.ts -t "restyling retry"` | ❌ W0 | ⬜ pending |
| 121-03-01 | 03 | 2 | SCR-05 | unit | `cd app && npm test -- tests/unit/ai/regeneration-correction-brief.test.ts -t "specific"` | ❌ W0 | ⬜ pending |
| 121-03-02 | 03 | 2 | SCR-05 | unit | `cd app && npm test -- tests/unit/ai/regeneration-correction-brief.test.ts -t "restyling"` | ❌ W0 | ⬜ pending |
| Regression | all | — | — | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/creative-quality-gate.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `creative-score-ceilings.ts` + `applyScoreCeilings` + `SCORE_CEILING_BY_FAILURE`
- [ ] Wire ceilings in `computeQualityGateFromAnalysis` / `runCompletedDerivationQualityGate` persist path
- [ ] SCR-01 dimension map in `buildCreativeScorePrompt` + test
- [ ] Mode-aware `shouldAutoRetryDerivation(generationMode, hardFailures, attempted)`
- [ ] Remove restyling skip in `derivation.ts`; base/style key resolution
- [ ] `runDerivationAutoRetry` two-image restyling support
- [ ] `FAILURE_CORRECTION_DIRECTIVES` map in `regeneration-correction-brief.ts`
- [ ] `creative-score-ceilings.test.ts`
- [ ] Extend `derivation-auto-retry-policy.test.ts`, `regeneration-correction-brief.test.ts`
- [ ] Optional: `derivation.test.ts` mock asserting retry invoked for restyling contamination

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
