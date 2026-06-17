---
phase: 129
slug: live-human-quality-corpus
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-17
---

# Phase 129 — Validation Strategy

> Per-phase validation contract for the live human quality corpus.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `app/config/vitest.config.ts` |
| **Quick run command** | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus app/src/components/feedback` |
| **Full suite command** | `cd app && npm test && npm run lint && npm run build` |
| **Estimated runtime** | ~120 seconds focused, full suite varies |

## Sampling Rate

- **After every task commit:** Run the task-specific focused command in the plan.
- **After every plan wave:** Run all focused Phase 129 tests touched so far.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 180 seconds for focused checks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 129-01-01 | 01 | 1 | HUMAN-01, HUMAN-04 | unit | `cd app && npm test -- tests/unit/human-quality/human-quality-corpus.test.ts` | ✅ | ✅ green |
| 129-01-02 | 01 | 1 | HUMAN-01, HUMAN-02 | repository | `cd app && npm test -- tests/unit/human-quality/human-quality-repository.test.ts` | ✅ | ✅ green |
| 129-01-03 | 01 | 1 | HUMAN-02 | unit | `cd app && npm test -- tests/unit/human-quality/human-quality-corpus.test.ts -t "privacy"` | ✅ | ✅ green |
| 129-02-01 | 02 | 2 | HUMAN-01, HUMAN-02 | route | `cd app && npm test -- app/src/app/api/feedback/human-quality-corpus/route.test.ts` | ✅ | ✅ green |
| 129-02-02 | 02 | 2 | HUMAN-03 | route | `cd app && npm test -- app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts` | ✅ | ✅ green |
| 129-02-03 | 02 | 2 | HUMAN-04 | route/unit | `cd app && npm test -- app/src/app/api/feedback/human-quality-corpus/route.test.ts tests/unit/human-quality/human-quality-repository.test.ts` | ✅ | ✅ green |
| 129-03-01 | 03 | 3 | HUMAN-03 | component | `cd app && npm test -- app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | ✅ | ✅ green |
| 129-03-02 | 03 | 3 | HUMAN-01, HUMAN-03 | component | `cd app && npm test -- app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | ✅ | ✅ green |
| 129-03-03 | 03 | 3 | HUMAN-01, HUMAN-02, HUMAN-03, HUMAN-04 | focused | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | ✅ | ✅ green |

## Wave 0 Requirements

- [x] Existing Vitest infrastructure is present.
- [x] Existing feedback route/component tests provide patterns.
- [x] New `tests/unit/human-quality/` and route/component tests were introduced test-first in Plans 01-03.

## Manual-Only Verifications

All Phase 129 behaviors have automated verification. Browser UAT is optional if execution introduces complex layout not covered by component tests.

## Validation Sign-Off

- [x] All tasks have automated verification or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers missing references through new test files.
- [x] No watch-mode flags.
- [x] Feedback latency target documented.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-17

