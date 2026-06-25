---
phase: 169
slug: real-corpus-and-claim-gates
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
---

# Phase 169 - Validation Strategy

> Per-phase validation contract for real corpus source gates and claim gates.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/human-quality/global-evidence.test.ts` |
| **Full suite command** | `cd app && npm test -- --run tests/unit/human-quality/candidate-capture.test.ts tests/unit/human-quality/candidate-promotion.test.ts tests/unit/human-quality/global-evidence.test.ts 'src/app/api/feedback/human-quality-corpus/candidates/route.test.ts' 'src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts' src/app/api/feedback/global-corpus-evidence/route.test.ts tests/unit/brand-taste/calibration-evidence.test.ts tests/unit/release/real-quality-release-evidence.test.ts tests/unit/release/operational-quality-release-evidence.test.ts` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific `npm test -- --run ...` command.
- **After every plan wave:** Run all tests for touched source/evidence/release paths.
- **Before `$gsd-verify-work`:** Full suite command above must be green.
- **Max feedback latency:** 120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 169-01-01 | 01 | 1 | SOURCE-01 | unit | `cd app && npm test -- --run tests/unit/human-quality/candidate-promotion.test.ts` | yes | green |
| 169-01-02 | 01 | 1 | SOURCE-01, SOURCE-02 | route/unit | `cd app && npm test -- --run tests/unit/human-quality/candidate-capture.test.ts tests/unit/human-quality/candidate-promotion.test.ts 'src/app/api/feedback/human-quality-corpus/candidates/route.test.ts' 'src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts'` | yes | green |
| 169-02-01 | 02 | 2 | SOURCE-02, SOURCE-03, SOURCE-04 | unit | `cd app && npm test -- --run tests/unit/human-quality/global-evidence.test.ts` | yes | green |
| 169-02-02 | 02 | 2 | SOURCE-03, SOURCE-04 | route/unit | `cd app && npm test -- --run src/app/api/feedback/global-corpus-evidence/route.test.ts tests/unit/brand-taste/calibration-evidence.test.ts` | yes | green |
| 169-03-01 | 03 | 3 | SOURCE-05 | release/unit | `cd app && npm test -- --run tests/unit/release/real-quality-release-evidence.test.ts tests/unit/release/operational-quality-release-evidence.test.ts` | yes | green |
| 169-03-02 | 03 | 3 | SOURCE-01..05 | integration | `cd app && npm test -- --run tests/unit/human-quality/candidate-capture.test.ts tests/unit/human-quality/candidate-promotion.test.ts tests/unit/human-quality/global-evidence.test.ts 'src/app/api/feedback/human-quality-corpus/candidates/route.test.ts' 'src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts' src/app/api/feedback/global-corpus-evidence/route.test.ts tests/unit/brand-taste/calibration-evidence.test.ts tests/unit/release/real-quality-release-evidence.test.ts tests/unit/release/operational-quality-release-evidence.test.ts` | yes | green |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- Candidate capture/promotion tests exist.
- Candidate list/promote API route tests exist.
- Global evidence tests exist.
- Global evidence API route test exists.
- Brand calibration evidence tests exist.
- Real/operational release evidence tests exist.

---

## Manual-Only Verifications

None required for the core backend claim gates. If execution adds a visible owner source-selection control, run a browser smoke for:

- source label selection,
- profile metadata visibility,
- successful promotion,
- evidence report showing withheld claims until sufficient real-customer sample exists.

---

## Validation Sign-Off

- [x] All tasks have automated verify or existing Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 120s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-25 for planning.
