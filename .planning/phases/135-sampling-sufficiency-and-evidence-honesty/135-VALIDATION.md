---
phase: 135
slug: sampling-sufficiency-and-evidence-honesty
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 135 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 (registry 4.1.9) |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/human-quality/sampling --passWithNoTests` |
| **Full suite command** | `cd app && npm test -- tests/unit/human-quality tests/unit/release/real-quality-release-evidence.test.ts` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- tests/unit/human-quality/sampling --passWithNoTests`
- **After every plan wave:** Run `cd app && npm test -- tests/unit/human-quality tests/unit/release/real-quality-release-evidence.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green + `cd app && npm run build`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 135-01-01 | 01 | 1 | SAMPLE-01 | unit | `cd app && npm test -- tests/unit/human-quality/sampling/thresholds.test.ts -x` | ❌ W0 | ⬜ pending |
| 135-01-02 | 01 | 1 | SAMPLE-02 | unit | `cd app && npm test -- tests/unit/human-quality/sampling/guidance.test.ts -x` | ❌ W0 | ⬜ pending |
| 135-01-03 | 01 | 1 | SAMPLE-02 | unit | `cd app && npm test -- tests/unit/human-quality/impact/report.test.ts tests/unit/human-quality/calibration/aggregate.test.ts -x` | ✅ extend | ⬜ pending |
| 135-02-01 | 02 | 2 | SAMPLE-03 | unit | `cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts -x` | ✅ extend | ⬜ pending |
| 135-02-02 | 02 | 2 | SAMPLE-03 | unit | `cd app && npm test -- tests/unit/human-quality/sampling/evidence-honesty.test.ts -x` | ❌ W0 | ⬜ pending |
| 135-03-01 | 03 | 2 | SAMPLE-04 | unit | `cd app && npm test -- tests/unit/human-quality/sampling/coverage.test.ts -x` | ❌ W0 | ⬜ pending |
| 135-03-02 | 03 | 2 | SAMPLE-04 | integration | `cd app && npm test -- src/app/api/feedback/sample-coverage/route.test.ts -x` | ❌ W0 | ⬜ pending |
| 135-03-03 | 03 | 2 | SAMPLE-04 | component | `cd app && npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx -x` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/human-quality/sampling/thresholds.test.ts` — SAMPLE-01 constant consolidation
- [ ] `tests/unit/human-quality/sampling/guidance.test.ts` — SAMPLE-02 `additionalNeeded` math
- [ ] `tests/unit/human-quality/sampling/coverage.test.ts` — SAMPLE-04 cross-gate rollup
- [ ] `tests/unit/human-quality/sampling/evidence-honesty.test.ts` — SAMPLE-03 checker rules
- [ ] `src/app/api/feedback/sample-coverage/route.test.ts` — auth + response shape
- [ ] Extend existing `impact/report.test.ts`, `calibration/aggregate.test.ts`, `HumanQualityCorpusPanel.test.tsx`, `real-quality-release-evidence.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator coverage with live evaluated items | SAMPLE-04 | Requires real corpus data | After Phase 134 operator handoff, open Coverage tab and confirm gap counts match evaluated corpus |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
