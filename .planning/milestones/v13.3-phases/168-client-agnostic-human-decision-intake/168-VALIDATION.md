---
phase: 168
slug: client-agnostic-human-decision-intake
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
---

# Phase 168 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- --run tests/unit/human-quality/human-quality-service.test.ts` |
| **Full suite command** | `cd app && npm test -- --run tests/unit/human-quality/human-quality-service.test.ts src/components/feedback/HumanQualityCorpusPanel.test.tsx src/components/admin/calibration-status-copy.test.ts tests/unit/brand-taste/calibration-evidence.test.ts tests/unit/brand-taste/taste-profile.test.ts 'src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts'` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific `npm test -- --run ...` command.
- **After every plan wave:** Run the full suite command above.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 90 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 168-01-01 | 01 | 1 | DECISION-02 | unit | `cd app && npm test -- --run tests/unit/human-quality/human-quality-service.test.ts` | yes | green (19 tests, 2026-06-25) |
| 168-01-02 | 01 | 1 | DECISION-04 | unit | `cd app && npm test -- --run tests/unit/human-quality/human-quality-service.test.ts tests/unit/brand-taste/calibration-evidence.test.ts` | yes | green (30 tests, 2026-06-25) |
| 168-02-01 | 02 | 2 | DECISION-01 | component | `cd app && npm test -- --run src/components/feedback/HumanQualityCorpusPanel.test.tsx` | yes | green (33 tests, 2026-06-25) |
| 168-02-02 | 02 | 2 | DECISION-03 | component | `cd app && npm test -- --run src/components/feedback/HumanQualityCorpusPanel.test.tsx src/components/admin/calibration-status-copy.test.ts` | yes | green (39 tests, 2026-06-25) |
| 168-03-01 | 03 | 3 | DECISION-05 | unit | `cd app && npm test -- --run tests/unit/brand-taste/calibration-evidence.test.ts tests/unit/brand-taste/taste-profile.test.ts` | yes | green (16 tests, 2026-06-25) |
| 168-03-02 | 03 | 3 | DECISION-01..05 | integration | `cd app && npm test -- --run tests/unit/human-quality/human-quality-service.test.ts src/components/feedback/HumanQualityCorpusPanel.test.tsx src/components/admin/calibration-status-copy.test.ts tests/unit/brand-taste/calibration-evidence.test.ts tests/unit/brand-taste/taste-profile.test.ts 'src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts'` | yes | green (83 tests / 6 files, 2026-06-25) |

*Status: verified 2026-06-25 — all automated commands green.*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- Vitest config exists.
- Human-quality service tests exist.
- Human-quality corpus API tests exist.
- Human-quality corpus panel tests exist.
- Brand evidence tests exist.

---

## Manual-Only Verifications

All Phase 168 behaviors have automated verification. Browser UAT can be added during execution only if UI changes materially affect layout.

---

## Validation Sign-Off

- [x] All tasks have automated verify or existing Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 90s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-25 for planning.
