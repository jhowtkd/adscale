---
phase: 167
slug: global-cross-client-promotion
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
---

# Phase 167 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/human-quality/learning/cross-client.test.ts` |
| **Full suite command** | `cd app && npm test` |
| **Estimated runtime** | ~10s quick / ~120s full |

---

## Sampling Rate

- **After every task commit:** Run quick run command on touched test files
- **After every plan wave:** Run `cd app && npm test -- --run tests/unit/human-quality/learning/ tests/unit/human-quality/improvement/ src/app/api/feedback/calibration-adjustments/`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 167-01-01 | 01 | 1 | GLOBAL-01 | T-167-01 | Cross-client proposes when 2+ brands + 6 evals | unit | `cd app && npm test -- --run tests/unit/human-quality/learning/cross-client.test.ts -x` | ✅ extend | ⬜ pending |
| 167-01-02 | 01 | 1 | GLOBAL-02 | T-167-02 | fixtureOnly true when all synthetic_fixture | unit | same | ❌ W0 | ⬜ pending |
| 167-01-03 | 01 | 1 | GLOBAL-03 | — | supportingClientRuleIds in evidenceRefs | unit | same | ❌ W0 | ⬜ pending |
| 167-01-04 | 01 | 1 | GLOBAL-01 | — | Skips when <2 clients or <6 evals (regression) | unit | same | ✅ extend | ⬜ pending |
| 167-02-01 | 02 | 2 | GLOBAL-04 | T-167-03 | Reject requires reason; 400 without | route | `cd app && npm test -- --run src/app/api/feedback/calibration-adjustments/\\[id\\]/reject/route.test.ts -x` | ❌ W0 | ⬜ pending |
| 167-02-02 | 02 | 2 | GLOBAL-04 | — | No auto-accept path in aggregator/generate | unit | `learning-proposal-aggregator` + generate route tests | ✅ extend | ⬜ pending |
| 167-02-03 | 02 | 2 | GLOBAL-03 | — | Accept with fixtureOnly requires acknowledgeFixtureOnly | route | `accept/route.test.ts` | ✅ extend | ⬜ pending |
| 167-03-01 | 03 | 3 | GLOBAL-03 | — | Calibration tab shows supporting client rules | component | `HumanQualityCorpusPanel.test.tsx` | ✅ extend | ⬜ pending |
| 167-03-02 | 03 | 3 | GLOBAL-05 | T-167-04 | Global rubric accept does not inject cross-profile corpus_quality | unit | `global-promotion-isolation.test.ts` | ❌ W0 | ⬜ pending |
| 167-03-03 | 03 | 3 | GLOBAL-01..05 | — | Phase verification doc | manual | `167-VERIFICATION.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `CalibrationAdjustmentEvidence` with `fixtureOnly`, `supportingClientRuleIds`, `promotionSource`
- [ ] `calibration-adjustments/[id]/reject/route.ts` + test
- [ ] Migration for `rejected` status on `rubric_calibration_adjustments`
- [ ] `global-promotion-isolation.test.ts` stub

*Existing `cross-client.test.ts` and accept route tests cover partial infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Calibration tab accept/reject UX flow | GLOBAL-03 | Optional screenshot | Owner corpus panel → Calibration → accept cross-client proposal |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
